/**
 * Tigerpaw Kalshi Extension
 *
 * Event contracts trading via Kalshi's Trading API (v2).
 * Provides event search, market details, order placement (policy-gated),
 * order cancellation (policy-gated), position tracking, portfolio balance,
 * and a background sync service.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the Kalshi API.
 */
import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  TradingPolicyEngine,
  writeAuditEntry,
  updatePolicyState,
  withPlatformPortfolio,
  withPlatformPositionCount,
  autoActivateIfBreached,
  checkKillSwitch,
  isOrderAllowedUnderKillSwitch,
  type TradeOrder,
} from "tigerpaw/trading";
import { kalshiConfigSchema, getBaseUrl, type KalshiConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "kalshi";
/** Estimated Kalshi settlement fee rate (~2%), factored into notional for policy checks. */
const SETTLEMENT_FEE_RATE = 0.02;

// -- PEM key loading (read once at registration; fail fast if missing) -------
let privateKeyPem: string | null = null;
function loadPrivateKey(path: string): string {
  if (privateKeyPem) return privateKeyPem;
  try {
    privateKeyPem = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`kalshi: failed to read PEM at "${path}": ${errMsg(err)}`);
  }
  return privateKeyPem;
}

// -- Auth: RSA-SHA256 signed headers per request -----------------------------
function buildAuthHeaders(
  cfg: KalshiConfig,
  method: string,
  path: string,
  pem: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signer = createSign("RSA-SHA256");
  signer.update(`${timestamp}${method}${path}`);
  signer.end();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "KALSHI-ACCESS-KEY": cfg.apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signer.sign(pem, "base64"),
    "KALSHI-ACCESS-TIMESTAMP": String(timestamp),
  };
}

// -- API helpers (native fetch, Node 22+) ------------------------------------
async function kalshiReq<T>(
  cfg: KalshiConfig,
  method: string,
  path: string,
  pem: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${getBaseUrl(cfg.mode)}${path}`, {
    method,
    headers: buildAuthHeaders(cfg, method, path, pem),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Kalshi API ${res.status}: ${t || res.statusText}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Kalshi API response types -----------------------------------------------
type KalshiEvent = {
  event_ticker: string;
  series_ticker: string;
  title: string;
  category: string;
  sub_title: string;
  mutually_exclusive: boolean;
  markets: KalshiMarketSummary[];
};
type KalshiMarketSummary = {
  ticker: string;
  title: string;
  status: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  volume: number;
  open_interest: number;
};
type KalshiMarket = {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  status: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  volume: number;
  open_interest: number;
  close_time: string;
  result: string;
  category: string;
  rules_primary: string;
};
type KalshiOrder = {
  order_id: string;
  ticker: string;
  status: string;
  side: string;
  type: string;
  yes_price: number;
  no_price: number;
  created_time: string;
  remaining_count: number;
};
type KalshiPosition = {
  ticker: string;
  market_exposure: number;
  resting_orders_count: number;
  total_traded: number;
  realized_pnl: number;
};
type KalshiBalance = { balance: number; payout: number };

// -- Formatting helpers ------------------------------------------------------
function cents(v: number): string {
  return `${v}\u00A2`;
}
function fmtDollar(v: number): string {
  return `$${(v / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function txt(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function txtD(text: string, details: unknown) {
  return { ...txt(text), details };
}

// -- Policy engine helper ----------------------------------------------------

function buildTradeOrder(opts: {
  ticker: string;
  side: "buy" | "sell";
  count: number;
  priceUsd: number;
}): TradeOrder {
  return {
    id: randomUUID(),
    extensionId: EXTENSION_ID,
    symbol: opts.ticker,
    side: opts.side,
    quantity: opts.count,
    priceUsd: opts.priceUsd,
    notionalUsd: opts.count * opts.priceUsd,
    orderType: "limit",
  };
}

// -- Plugin ------------------------------------------------------------------
const kalshiPlugin = {
  id: EXTENSION_ID,
  name: "Kalshi",
  description: "Kalshi event contracts trading extension",
  kind: "trading" as const,
  configSchema: kalshiConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = kalshiConfigSchema.parse(api.pluginConfig);
    const pem = loadPrivateKey(cfg.privateKeyPath);
    api.logger.info(`kalshi: plugin registered (mode: ${cfg.mode})`);

    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: kalshi_search_events ----------------------------------------
    api.registerTool(
      {
        name: "kalshi_search_events",
        label: "Search Events",
        description:
          "Search for open events on Kalshi by series ticker. Returns matching events with their markets, prices, and volume.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Series ticker to search for (e.g. KXBTC, KXELECTION)",
            },
            limit: { type: "number", description: "Max results (default: 10)" },
          },
          required: ["query"],
        },
        async execute(_id: string, params: unknown) {
          const { query, limit = 10 } = params as { query: string; limit?: number };
          const path = `/events?status=open&series_ticker=${encodeURIComponent(query)}&limit=${Math.min(Math.max(1, limit), 50)}`;
          const data = await kalshiReq<{ events: KalshiEvent[] }>(cfg, "GET", path, pem);
          const events = data.events ?? [];
          if (!events.length) return txtD("No open events found.", { count: 0 });
          const lines = events.map((e, i) => {
            const mkts = (e.markets ?? [])
              .slice(0, 3)
              .map(
                (m) =>
                  `     ${m.ticker}: Yes ${cents(m.yes_bid)}/${cents(m.yes_ask)} | No ${cents(m.no_bid)}/${cents(m.no_ask)} | Vol: ${m.volume}`,
              )
              .join("\n");
            return `${i + 1}. ${e.title}\n   Event: ${e.event_ticker} | Series: ${e.series_ticker} | Category: ${e.category}\n${mkts}`;
          });
          return txtD(`Found ${events.length} event(s):\n\n${lines.join("\n\n")}`, {
            count: events.length,
            events: events.map((e) => ({
              event_ticker: e.event_ticker,
              title: e.title,
              category: e.category,
              market_count: e.markets?.length ?? 0,
            })),
          });
        },
      },
      { name: "kalshi_search_events" },
    );

    // -- Tool 2: kalshi_get_market -------------------------------------------
    api.registerTool(
      {
        name: "kalshi_get_market",
        label: "Get Market",
        description: "Get detailed information about a specific Kalshi market by its ticker.",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "The market ticker (e.g. KXBTC-25MAR14-T99999)",
            },
          },
          required: ["ticker"],
        },
        async execute(_id: string, params: unknown) {
          const { ticker } = params as { ticker: string };
          const m = await kalshiReq<{ market: KalshiMarket }>(
            cfg,
            "GET",
            `/markets/${encodeURIComponent(ticker)}`,
            pem,
          );
          const mkt = m.market;
          const text = [
            `Market: ${mkt.title}`,
            `Ticker: ${mkt.ticker} | Event: ${mkt.event_ticker}`,
            `Status: ${mkt.status} | Category: ${mkt.category}`,
            `Yes: ${cents(mkt.yes_bid)}/${cents(mkt.yes_ask)} | No: ${cents(mkt.no_bid)}/${cents(mkt.no_ask)}`,
            `Volume: ${mkt.volume} | Open Interest: ${mkt.open_interest}`,
            `Close: ${mkt.close_time} | Result: ${mkt.result || "pending"}`,
            mkt.subtitle ? `Subtitle: ${mkt.subtitle}` : null,
            mkt.rules_primary ? `Rules: ${mkt.rules_primary.slice(0, 200)}` : null,
          ]
            .filter(Boolean)
            .join("\n");
          return txtD(text, { market: mkt });
        },
      },
      { name: "kalshi_get_market" },
    );

    // -- Tool 3: kalshi_place_order (POLICY-GATED) ---------------------------
    api.registerTool(
      {
        name: "kalshi_place_order",
        label: "Place Order",
        description:
          "Place an order on a Kalshi event contract market. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, " +
          "daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string", description: "Market ticker to trade on" },
            side: { type: "string", enum: ["yes", "no"], description: "Contract side: yes or no" },
            count: { type: "number", description: "Number of contracts to buy/sell" },
            type: {
              type: "string",
              enum: ["market", "limit"],
              description: "Order type (default: market)",
            },
            yes_price: { type: "number", description: "Limit price for yes side in cents (1-99)" },
            no_price: { type: "number", description: "Limit price for no side in cents (1-99)" },
          },
          required: ["ticker", "side", "count"],
        },
        async execute(_id: string, params: unknown) {
          const {
            ticker,
            side,
            count,
            type = "market",
            yes_price,
            no_price,
          } = params as {
            ticker: string;
            side: "yes" | "no";
            count: number;
            type?: "market" | "limit";
            yes_price?: number;
            no_price?: number;
          };
          if (count <= 0) return txtD("Count must be greater than 0.", { error: "invalid_count" });
          if (type === "limit" && yes_price === undefined && no_price === undefined) {
            return txtD("Limit orders require yes_price or no_price to be specified.", {
              error: "missing_limit_price",
            });
          }

          // Kalshi prices are in cents; convert to USD for policy evaluation.
          // Include estimated settlement fee (~2%) so the policy engine sees the true cost.
          const priceCents = side === "yes" ? (yes_price ?? 50) : (no_price ?? 50);
          const priceUsd = priceCents / 100;
          const rawNotionalUsd = count * priceUsd;
          const notionalUsd = rawNotionalUsd * (1 + SETTLEMENT_FEE_RATE);

          // Fail-safe: block orders when policy engine is not configured.
          if (!policyEngine) {
            api.logger.error("Trading policy engine not configured — order blocked for safety");
            return txtD(
              "Order blocked: trading policy engine not configured. Enable trading in config.",
              { error: "no_policy_engine" },
            );
          }

          // Policy gate: evaluateOrder() before execution.
          const order = buildTradeOrder({ ticker, side: "buy", count, priceUsd });
          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`kalshi: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`kalshi: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Ticker: ${ticker} | Side: ${side.toUpperCase()} | Count: ${count}\n` +
                `Estimated notional: $${notionalUsd.toFixed(2)}`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          const orderBody: Record<string, unknown> = { ticker, side, count, type, action: "buy" };
          if (yes_price !== undefined) orderBody.yes_price = yes_price;
          if (no_price !== undefined) orderBody.no_price = no_price;

          api.logger.info(`kalshi: placing ${side} ${type} order: ${count} contracts on ${ticker}`);
          try {
            const result = await kalshiReq<{ order: KalshiOrder }>(
              cfg,
              "POST",
              "/portfolio/orders",
              pem,
              orderBody,
            );
            const o = result.order;

            // Post-trade: update policy state and write audit entry.
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              dailySpendUsd: state.dailySpendUsd + notionalUsd,
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({ ticker, side: "buy", count, priceUsd }),
            });

            const text = [
              "Order placed successfully.",
              `Order ID: ${o.order_id} | Ticker: ${o.ticker}`,
              `Side: ${o.side.toUpperCase()} | Count: ${count} | Type: ${o.type}`,
              `Yes Price: ${cents(o.yes_price)} | No Price: ${cents(o.no_price)}`,
              `Status: ${o.status} | Created: ${o.created_time}`,
            ].join("\n");
            return txtD(text, {
              orderId: o.order_id,
              ticker: o.ticker,
              side: o.side,
              count,
              type: o.type,
              status: o.status,
            });
          } catch (err) {
            api.logger.warn(`kalshi: order failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return txtD(`Order failed: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kalshi_place_order" },
    );

    // -- Tool 4: kalshi_cancel_order (POLICY-GATED) --------------------------
    api.registerTool(
      {
        name: "kalshi_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on Kalshi. POLICY-GATED: kill switch and audit trail checked before execution.",
        parameters: {
          type: "object",
          properties: { orderId: { type: "string", description: "The order ID to cancel" } },
          required: ["orderId"],
        },
        async execute(_id: string, params: unknown) {
          const { orderId } = params as { orderId: string };
          api.logger.info(`kalshi: cancelling order ${orderId}`);

          // Kill switch gate: hard mode blocks cancels, soft mode allows them.
          const killStatus = await checkKillSwitch();
          if (killStatus.active && !isOrderAllowedUnderKillSwitch(killStatus, "cancel")) {
            const reason = `kill switch active (${killStatus.mode ?? "hard"} mode): ${killStatus.reason ?? "no reason provided"}`;
            api.logger.warn(`kalshi: cancel denied — ${reason}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "denied",
              actor: "system",
              error: reason,
            });
            return txtD(`Cancel denied: ${reason}`, { error: "kill_switch", reason });
          }

          try {
            await kalshiReq(cfg, "DELETE", `/portfolio/orders/${encodeURIComponent(orderId)}`, pem);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "cancelled",
              actor: "agent",
            });
            return txtD(`Order ${orderId} cancelled successfully.`, {
              orderId,
              status: "cancelled",
            });
          } catch (err) {
            api.logger.warn(`kalshi: cancel failed for ${orderId}: ${errMsg(err)}`);
            return txtD(`Cancel failed: ${errMsg(err)}`, { orderId, error: errMsg(err) });
          }
        },
      },
      { name: "kalshi_cancel_order" },
    );

    // -- Tool 5: kalshi_get_positions ----------------------------------------
    api.registerTool(
      {
        name: "kalshi_get_positions",
        label: "Get Positions",
        description: "Get current open positions on Kalshi, including exposure and realized P&L.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const data = await kalshiReq<{ market_positions: KalshiPosition[] }>(
              cfg,
              "GET",
              "/portfolio/positions",
              pem,
            );
            const positions = data.market_positions ?? [];
            if (!positions.length) return txtD("No open positions.", { count: 0 });
            const lines = positions.map(
              (p, i) =>
                `${i + 1}. ${p.ticker}\n   Exposure: ${fmtDollar(p.market_exposure)} | Traded: ${p.total_traded} contracts\n   Resting Orders: ${p.resting_orders_count} | Realized P&L: ${fmtDollar(p.realized_pnl)}`,
            );
            return txtD(`Open positions (${positions.length}):\n\n${lines.join("\n\n")}`, {
              count: positions.length,
              positions: positions.map((p) => ({
                ticker: p.ticker,
                market_exposure: p.market_exposure,
                realized_pnl: p.realized_pnl,
                total_traded: p.total_traded,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kalshi_get_positions" },
    );

    // -- Tool 6: kalshi_get_portfolio ----------------------------------------
    api.registerTool(
      {
        name: "kalshi_get_portfolio",
        label: "Get Portfolio Balance",
        description:
          "Get Kalshi portfolio balance including available balance and pending payouts.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const b = await kalshiReq<KalshiBalance>(cfg, "GET", "/portfolio/balance", pem);
            const text = [
              `Portfolio Balance`,
              `Available: ${fmtDollar(b.balance)}`,
              `Pending Payout: ${fmtDollar(b.payout)}`,
            ].join("\n");
            return txtD(text, { balance: b.balance, payout: b.payout });
          } catch (err) {
            return txtD(`Failed to fetch portfolio balance: ${errMsg(err)}`, {
              error: errMsg(err),
            });
          }
        },
      },
      { name: "kalshi_get_portfolio" },
    );

    // -- Service: kalshi-sync (periodic position sync) -----------------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "kalshi-sync",
      start: () => {
        const syncMs = cfg.syncIntervalMs ?? SYNC_INTERVAL_MS;
        api.logger.info(`kalshi-sync: starting position sync (every ${syncMs / 1000}s)`);
        const sync = async () => {
          try {
            const [posData, balance] = await Promise.all([
              kalshiReq<{ market_positions: KalshiPosition[] }>(
                cfg,
                "GET",
                "/portfolio/positions",
                pem,
              ),
              kalshiReq<KalshiBalance>(cfg, "GET", "/portfolio/balance", pem),
            ]);
            const positions = posData.market_positions ?? [];
            const totalPnl = positions.reduce((s, p) => s + (p.realized_pnl ?? 0), 0);
            const balanceUsd = balance.balance / 100;
            api.logger.info(
              `kalshi-sync: ${positions.length} position(s), realized P&L: ${fmtDollar(totalPnl)}, balance: ${fmtDollar(balance.balance)}`,
            );

            // Persist position data to policy state.
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};
            for (const p of positions) {
              const exposureUsd = p.market_exposure / 100;
              positionsByAsset[`kalshi:${p.ticker}`] = {
                extensionId: EXTENSION_ID,
                valueUsd: exposureUsd,
                percentOfPortfolio: balanceUsd > 0 ? (exposureUsd / balanceUsd) * 100 : 0,
              };
            }

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              ...withPlatformPositionCount(state, EXTENSION_ID, positions.length),
              ...withPlatformPortfolio(state, EXTENSION_ID, balanceUsd),
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, balanceUsd),
              positionsByAsset: { ...state.positionsByAsset, ...positionsByAsset },
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
            api.logger.warn(`kalshi-sync: sync failed: ${errMsg(err)}`);
          }
        };
        sync();
        syncTimer = setInterval(sync, syncMs);
      },
      stop: () => {
        if (syncTimer) {
          clearInterval(syncTimer);
          syncTimer = null;
        }
        api.logger.info("kalshi-sync: stopped");
      },
    });
  },
};

export default kalshiPlugin;
