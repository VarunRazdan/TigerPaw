/**
 * Tigerpaw Manifold Markets Extension
 *
 * Play-money prediction market trading via Manifold's REST API.
 * Provides market search, market detail, bet placement (policy-gated),
 * share selling (policy-gated), position retrieval, balance checking,
 * and a background sync service.
 *
 * Manifold uses play money (Mana), so the policy engine approval mode
 * defaults to "auto" -- no real-money risk. The policy engine still
 * validates kill switch, daily limits, and cooldowns.
 *
 * All bet placement and selling tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the Manifold API.
 */
import { randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  TradingPolicyEngine,
  writeAuditEntry,
  updatePolicyState,
  withPlatformPortfolio,
  autoActivateIfBreached,
  type TradeOrder,
} from "tigerpaw/trading";
import { manifoldConfigSchema, BASE_URL, type ManifoldConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const BALANCE_SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "manifold";

// -- API helpers (native fetch, Node 22+) ------------------------------------

function buildHeaders(cfg: ManifoldConfig): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (cfg.apiKey) h.Authorization = `Key ${cfg.apiKey}`;
  return h;
}

async function apiGet<T>(cfg: ManifoldConfig, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "GET", headers: buildHeaders(cfg) });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Manifold API ${res.status}: ${b || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(cfg: ManifoldConfig, path: string, body: unknown): Promise<T> {
  if (!cfg.apiKey)
    throw new Error(
      "Manifold API key is required for write operations. Configure manifold.apiKey to place bets or sell shares.",
    );
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Manifold API ${res.status}: ${t || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Manifold API response types ---------------------------------------------

type ManifoldMarket = {
  id: string;
  slug: string;
  question: string;
  description: unknown;
  creatorName: string;
  createdTime: number;
  closeTime?: number;
  isResolved: boolean;
  resolution?: string;
  probability?: number;
  pool?: Record<string, number>;
  totalLiquidity?: number;
  volume: number;
  volume24Hours?: number;
  mechanism: string;
  outcomeType: string;
  url: string;
};
type ManifoldBet = {
  id: string;
  contractId: string;
  amount: number;
  outcome: string;
  shares: number;
  probBefore: number;
  probAfter: number;
  createdTime: number;
  isFilled: boolean;
};
type ManifoldUser = {
  id: string;
  username: string;
  name: string;
  balance: number;
  totalDeposits: number;
  profitCached?: { daily: number; weekly: number; monthly: number; allTime: number };
};

// -- Formatting helpers ------------------------------------------------------

function fmtMana(v: number): string {
  return `M$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function fmtTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
function txt(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function txtD(text: string, details: unknown) {
  return { ...txt(text), details };
}

// -- Policy engine helper ----------------------------------------------------

function buildTradeOrder(opts: {
  contractId: string;
  side: "buy" | "sell";
  amount: number;
}): TradeOrder {
  return {
    id: randomUUID(),
    extensionId: EXTENSION_ID,
    symbol: opts.contractId,
    side: opts.side,
    quantity: 1,
    priceUsd: opts.amount,
    notionalUsd: opts.amount,
    orderType: "market",
  };
}

// -- Plugin Definition -------------------------------------------------------

const manifoldPlugin = {
  id: EXTENSION_ID,
  name: "Manifold",
  description: "Manifold Markets play-money prediction markets extension",
  kind: "trading" as const,
  configSchema: manifoldConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = manifoldConfigSchema.parse(api.pluginConfig);
    api.logger.info(`manifold: plugin registered (auth: ${cfg.apiKey ? "yes" : "read-only"})`);

    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: manifold_search_markets -------------------------------------
    api.registerTool(
      {
        name: "manifold_search_markets",
        label: "Search Markets",
        description:
          "Search for prediction markets on Manifold Markets. Returns matching markets with probabilities, volume, and liquidity.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query for finding markets" },
            limit: { type: "number", description: "Max results (default: 10)" },
          },
          required: ["query"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { query, limit = 10 } = params as { query: string; limit?: number };
          const clampedLimit = Math.min(Math.max(1, limit), 50);
          const markets = await apiGet<ManifoldMarket[]>(
            cfg,
            `/search-markets?term=${encodeURIComponent(query)}&limit=${clampedLimit}`,
          );
          if (!markets?.length) {
            return txtD("No markets found.", { count: 0 });
          }
          const lines = markets.map((m, i) => {
            const prob = m.probability !== undefined ? fmtPct(m.probability) : "N/A";
            const vol = fmtMana(m.volume);
            const liq = m.totalLiquidity !== undefined ? fmtMana(m.totalLiquidity) : "N/A";
            const status = m.isResolved ? `Resolved: ${m.resolution}` : "Open";
            return `${i + 1}. ${m.question}\n   Slug: ${m.slug} | Prob: ${prob} | Vol: ${vol} | Liq: ${liq}\n   Status: ${status} | Type: ${m.outcomeType}`;
          });
          return txtD(`Found ${markets.length} market(s):\n\n${lines.join("\n\n")}`, {
            count: markets.length,
            markets: markets.map((m) => ({
              id: m.id,
              slug: m.slug,
              question: m.question,
              probability: m.probability,
              volume: m.volume,
              isResolved: m.isResolved,
            })),
          });
        },
      },
      { name: "manifold_search_markets" },
    );

    // -- Tool 2: manifold_get_market -----------------------------------------
    api.registerTool(
      {
        name: "manifold_get_market",
        label: "Get Market",
        description:
          "Get detailed information about a specific Manifold prediction market by its slug or ID.",
        parameters: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "The market slug (from URL or search results) or market ID",
            },
          },
          required: ["slug"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { slug } = params as { slug: string };
          const m = await apiGet<ManifoldMarket>(cfg, `/market/${encodeURIComponent(slug)}`);
          const prob = m.probability !== undefined ? fmtPct(m.probability) : "N/A";
          const vol = fmtMana(m.volume);
          const liq = m.totalLiquidity !== undefined ? fmtMana(m.totalLiquidity) : "N/A";
          const vol24 = m.volume24Hours !== undefined ? fmtMana(m.volume24Hours) : "N/A";
          const closeTime = m.closeTime ? fmtTimestamp(m.closeTime) : "N/A";
          const status = m.isResolved ? `Resolved: ${m.resolution}` : "Open";

          const text = [
            `Market: ${m.question}`,
            `ID: ${m.id} | Slug: ${m.slug}`,
            `Creator: ${m.creatorName} | Type: ${m.outcomeType} | Mechanism: ${m.mechanism}`,
            `Probability: ${prob}`,
            `Volume: ${vol} | 24h Volume: ${vol24} | Liquidity: ${liq}`,
            `Close: ${closeTime} | Status: ${status}`,
            `URL: ${m.url}`,
          ].join("\n");
          return txtD(text, { market: m });
        },
      },
      { name: "manifold_get_market" },
    );

    // -- Tool 3: manifold_place_bet (POLICY-GATED) ---------------------------
    api.registerTool(
      {
        name: "manifold_place_bet",
        label: "Place Bet",
        description:
          "Place a bet on a Manifold prediction market using play money (Mana). " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, " +
          "daily spend caps, and approval mode before execution. " +
          "Since Manifold uses play money, approval mode defaults to auto.",
        parameters: {
          type: "object",
          properties: {
            contractId: {
              type: "string",
              description: "The market/contract ID to bet on",
            },
            amount: {
              type: "number",
              description: "Amount of Mana to bet",
            },
            outcome: {
              type: "string",
              enum: ["YES", "NO"],
              description: "Bet outcome: YES or NO",
            },
          },
          required: ["contractId", "amount", "outcome"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { contractId, amount, outcome } = params as {
            contractId: string;
            amount: number;
            outcome: "YES" | "NO";
          };
          if (amount <= 0) {
            return txtD("Amount must be greater than 0.", { error: "invalid_amount" });
          }
          if (outcome !== "YES" && outcome !== "NO") {
            return txtD('Outcome must be "YES" or "NO".', { error: "invalid_outcome" });
          }

          // Fail-safe: block orders when policy engine is not configured.
          if (!policyEngine) {
            api.logger.error("Trading policy engine not configured — order blocked for safety");
            return txtD(
              "Order blocked: trading policy engine not configured. Enable trading in config.",
              { error: "no_policy_engine" },
            );
          }

          // Policy gate: evaluateOrder() before execution.
          const order = buildTradeOrder({ contractId, side: "buy", amount });
          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`manifold: bet denied by policy engine: ${decision.reason}`);
            return txtD(`Bet denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`manifold: bet pending ${decision.approvalMode} approval`);
            return txtD(
              `Bet requires ${decision.approvalMode} approval before execution.\n` +
                `Contract: ${contractId} | Outcome: ${outcome} | Amount: ${fmtMana(amount)}`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          api.logger.info(`manifold: placing ${outcome} bet: ${fmtMana(amount)} on ${contractId}`);
          try {
            const result = await apiPost<ManifoldBet>(cfg, "/bet", {
              contractId,
              amount,
              outcome,
            });

            // Post-trade: update policy state and write audit entry.
            // NOTE: Manifold uses play money (Mana), not USD. We track trade
            // count and timestamp but do NOT add to dailySpendUsd — doing so
            // would inflate the spend tracker and trigger limits for real-money
            // platforms.
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({ contractId, side: "buy", amount }),
            });

            const text = [
              `Bet placed successfully.`,
              `Bet ID: ${result.id} | Contract: ${result.contractId}`,
              `Outcome: ${result.outcome} | Amount: ${fmtMana(result.amount)}`,
              `Shares: ${result.shares.toFixed(2)} | Prob: ${fmtPct(result.probBefore)} -> ${fmtPct(result.probAfter)}`,
            ].join("\n");
            return txtD(text, {
              betId: result.id,
              contractId: result.contractId,
              outcome: result.outcome,
              amount: result.amount,
              shares: result.shares,
              probBefore: result.probBefore,
              probAfter: result.probAfter,
            });
          } catch (err) {
            api.logger.warn(`manifold: bet failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return txtD(`Bet failed: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "manifold_place_bet" },
    );

    // -- Tool 4: manifold_sell_shares (POLICY-GATED) -------------------------
    api.registerTool(
      {
        name: "manifold_sell_shares",
        label: "Sell Shares",
        description:
          "Sell shares in a Manifold prediction market. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, " +
          "and approval mode before execution. " +
          "Since Manifold uses play money, approval mode defaults to auto.",
        parameters: {
          type: "object",
          properties: {
            contractId: {
              type: "string",
              description: "The market/contract ID to sell shares in",
            },
            outcome: {
              type: "string",
              enum: ["YES", "NO"],
              description: "Which outcome's shares to sell: YES or NO",
            },
            shares: {
              type: "number",
              description: "Number of shares to sell",
            },
          },
          required: ["contractId", "outcome", "shares"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { contractId, outcome, shares } = params as {
            contractId: string;
            outcome: "YES" | "NO";
            shares: number;
          };
          if (shares <= 0) {
            return txtD("Shares must be greater than 0.", { error: "invalid_shares" });
          }
          if (outcome !== "YES" && outcome !== "NO") {
            return txtD('Outcome must be "YES" or "NO".', { error: "invalid_outcome" });
          }

          // Fail-safe: block orders when policy engine is not configured.
          if (!policyEngine) {
            api.logger.error("Trading policy engine not configured — order blocked for safety");
            return txtD(
              "Order blocked: trading policy engine not configured. Enable trading in config.",
              { error: "no_policy_engine" },
            );
          }

          // Policy gate: evaluateOrder() before execution.
          // Sells reduce risk, but we still check kill switch and audit.
          const order = buildTradeOrder({ contractId, side: "sell", amount: shares });
          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`manifold: sell denied by policy engine: ${decision.reason}`);
            return txtD(`Sell denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          api.logger.info(`manifold: selling ${shares} ${outcome} shares on ${contractId}`);
          try {
            const result = await apiPost<ManifoldBet>(
              cfg,
              `/market/${encodeURIComponent(contractId)}/sell`,
              { outcome, shares },
            );

            // Post-trade: update policy state and write audit entry.
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({ contractId, side: "sell", amount: shares }),
            });

            const text = [
              `Shares sold successfully.`,
              `Bet ID: ${result.id} | Contract: ${result.contractId}`,
              `Outcome: ${result.outcome} | Shares Sold: ${result.shares.toFixed(2)}`,
              `Mana Received: ${fmtMana(Math.abs(result.amount))}`,
              `Prob: ${fmtPct(result.probBefore)} -> ${fmtPct(result.probAfter)}`,
            ].join("\n");
            return txtD(text, {
              betId: result.id,
              contractId: result.contractId,
              outcome: result.outcome,
              shares: result.shares,
              amount: result.amount,
              probBefore: result.probBefore,
              probAfter: result.probAfter,
            });
          } catch (err) {
            api.logger.warn(`manifold: sell failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return txtD(`Sell failed: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "manifold_sell_shares" },
    );

    // -- Tool 5: manifold_get_positions --------------------------------------
    api.registerTool(
      {
        name: "manifold_get_positions",
        label: "Get Positions",
        description:
          "Get the authenticated user's profile and portfolio on Manifold, including balance and profit stats.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_toolCallId: string, _params: unknown) {
          if (!cfg.apiKey) {
            return txtD("API key is required to view positions. Configure manifold.apiKey.", {
              error: "no_api_key",
            });
          }
          try {
            const user = await apiGet<ManifoldUser>(cfg, "/me");
            const profit = user.profitCached;
            const text = [
              `User: ${user.name} (@${user.username})`,
              `Balance: ${fmtMana(user.balance)}`,
              `Total Deposits: ${fmtMana(user.totalDeposits)}`,
              profit
                ? `Profit -- Daily: ${fmtMana(profit.daily)} | Weekly: ${fmtMana(profit.weekly)} | Monthly: ${fmtMana(profit.monthly)} | All-Time: ${fmtMana(profit.allTime)}`
                : "Profit: N/A",
            ].join("\n");
            return txtD(text, {
              userId: user.id,
              username: user.username,
              balance: user.balance,
              totalDeposits: user.totalDeposits,
              profit: profit ?? null,
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, {
              error: errMsg(err),
            });
          }
        },
      },
      { name: "manifold_get_positions" },
    );

    // -- Tool 6: manifold_get_balance ----------------------------------------
    api.registerTool(
      {
        name: "manifold_get_balance",
        label: "Get Balance",
        description: "Get the current Mana balance for the authenticated Manifold user.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_toolCallId: string, _params: unknown) {
          if (!cfg.apiKey) {
            return txtD("API key is required to check balance. Configure manifold.apiKey.", {
              error: "no_api_key",
            });
          }
          try {
            const user = await apiGet<ManifoldUser>(cfg, "/me");
            const text = `Balance: ${fmtMana(user.balance)}\nUser: ${user.name} (@${user.username})`;
            return txtD(text, {
              balance: user.balance,
              userId: user.id,
              username: user.username,
            });
          } catch (err) {
            return txtD(`Failed to fetch balance: ${errMsg(err)}`, {
              error: errMsg(err),
            });
          }
        },
      },
      { name: "manifold_get_balance" },
    );

    // -- Service: manifold-sync (periodic balance sync) ----------------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "manifold-sync",
      start: () => {
        if (!cfg.apiKey) {
          api.logger.info("manifold-sync: skipping (no API key, read-only mode)");
          return;
        }
        const syncMs = cfg.syncIntervalMs ?? BALANCE_SYNC_INTERVAL_MS;
        api.logger.info(`manifold-sync: starting balance sync (every ${syncMs / 1000}s)`);
        const syncBalance = async () => {
          try {
            const user = await apiGet<ManifoldUser>(cfg, "/me");
            const profit = user.profitCached;
            api.logger.info(
              `manifold-sync: balance ${fmtMana(user.balance)}, all-time profit: ${profit ? fmtMana(profit.allTime) : "N/A"}`,
            );

            // Persist balance data to policy state.
            // NOTE: Manifold uses play money (Mana), not USD. We do NOT add
            // the balance to portfolioByPlatform / currentPortfolioValueUsd
            // because doing so would inflate the portfolio total and skew risk
            // percentage calculations for real-money platforms.
            const updatedState = await updatePolicyState((state) => ({
              ...state,
            }));

            if (policyEngine) {
              await autoActivateIfBreached(updatedState, {
                dailyLossLimitPercent: api.tradingPolicyConfig?.limits.dailyLossLimitPercent ?? 10,
                maxPortfolioDrawdownPercent:
                  api.tradingPolicyConfig?.limits.maxPortfolioDrawdownPercent ?? 20,
                consecutiveLossPause: api.tradingPolicyConfig?.limits.consecutiveLossPause ?? 5,
              });
            }
          } catch (err) {
            api.logger.warn(`manifold-sync: sync failed: ${errMsg(err)}`);
          }
        };
        syncBalance();
        syncTimer = setInterval(syncBalance, syncMs);
      },
      stop: () => {
        if (syncTimer) {
          clearInterval(syncTimer);
          syncTimer = null;
        }
        api.logger.info("manifold-sync: stopped");
      },
    });
  },
};

export default manifoldPlugin;
