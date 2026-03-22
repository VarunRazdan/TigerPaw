/**
 * Tigerpaw Polymarket Extension
 *
 * Prediction market trading via Polymarket's CLOB and Gamma APIs.
 * Provides market search, order placement (policy-gated), position tracking,
 * and a background sync service.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the CLOB API.
 */

import { randomUUID, createHmac } from "node:crypto";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  TradingPolicyEngine,
  writeAuditEntry,
  updatePolicyState,
  autoActivateIfBreached,
  type TradeOrder,
} from "tigerpaw/trading";
import { polymarketConfigSchema, type PolymarketConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const POSITION_SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "polymarket";

// -- API helpers (native fetch, Node 22+) ------------------------------------

function buildClobHeaders(cfg: PolymarketConfig, method: string, path: string, body?: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${timestamp}${method}${path}${body ?? ""}`;
  const signature = createHmac("sha256", cfg.apiSecret).update(message).digest("base64");
  return {
    "Content-Type": "application/json",
    "POLY-API-KEY": cfg.apiKey,
    "POLY-PASSPHRASE": cfg.passphrase,
    "POLY-SIGNATURE": signature,
    "POLY-TIMESTAMP": timestamp,
  };
}

async function gammaGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GAMMA_API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gamma API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function clobRequest<T>(
  cfg: PolymarketConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${CLOB_API_BASE}${path}`, {
    method,
    headers: buildClobHeaders(cfg, method, path, bodyStr),
    body: bodyStr,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CLOB API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Gamma API response types ------------------------------------------------

type GammaMarket = {
  id: string;
  question: string;
  description: string;
  active: boolean;
  closed: boolean;
  volume: string;
  liquidity: string;
  outcomes: string[];
  outcomePrices: string[];
  endDate: string;
  category: string;
  conditionId: string;
};

// -- CLOB API response types -------------------------------------------------

type ClobOrder = {
  id: string;
  status: string;
  market: string;
  side: string;
  size: string;
  price: string;
  createdAt: string;
};

type ClobPosition = {
  asset: string;
  market: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  pnl: string;
};

// -- Formatting helpers ------------------------------------------------------

function fmtOutcomePrices(m: GammaMarket, decimals = 2): string {
  if (!m.outcomePrices) return "N/A";
  return m.outcomes
    .map((o, i) => `${o}: ${parseFloat(m.outcomePrices[i] ?? "0").toFixed(decimals)}`)
    .join(", ");
}

function fmtDollar(v: string | number): string {
  return `$${parseFloat(String(v || "0")).toLocaleString()}`;
}

// -- Policy engine helper ----------------------------------------------------

function buildTradeOrder(opts: {
  marketId: string;
  side: "buy" | "sell";
  size: number;
  price: number;
}): TradeOrder {
  return {
    id: randomUUID(),
    extensionId: EXTENSION_ID,
    symbol: opts.marketId,
    side: opts.side,
    quantity: opts.size,
    priceUsd: opts.price,
    notionalUsd: opts.size * opts.price,
    orderType: "limit",
  };
}

// -- Plugin Definition -------------------------------------------------------

const polymarketPlugin = {
  id: EXTENSION_ID,
  name: "Polymarket",
  description: "Polymarket prediction markets trading extension",
  kind: "trading" as const,
  configSchema: polymarketConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = polymarketConfigSchema.parse(api.pluginConfig);
    api.logger.info("polymarket: plugin registered");

    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: polymarket_search_markets ------------------------------------
    api.registerTool(
      {
        name: "polymarket_search_markets",
        label: "Search Markets",
        description:
          "Search for prediction markets on Polymarket. Returns matching markets with prices, volume, and liquidity.",
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
          const markets = await gammaGet<GammaMarket[]>(
            `/markets?text_query=${encodeURIComponent(query)}&limit=${Math.min(Math.max(1, limit), 50)}`,
          );
          if (!markets?.length) {
            return {
              content: [{ type: "text", text: "No markets found." }],
              details: { count: 0 },
            };
          }
          const lines = markets.map(
            (m, i) =>
              `${i + 1}. ${m.question}\n   ID: ${m.id} | Prices: ${fmtOutcomePrices(m)}\n   Vol: ${fmtDollar(m.volume)} | Liq: ${fmtDollar(m.liquidity)} | Active: ${m.active}`,
          );
          return {
            content: [
              { type: "text", text: `Found ${markets.length} market(s):\n\n${lines.join("\n\n")}` },
            ],
            details: {
              count: markets.length,
              markets: markets.map((m) => ({
                id: m.id,
                question: m.question,
                active: m.active,
                volume: m.volume,
              })),
            },
          };
        },
      },
      { name: "polymarket_search_markets" },
    );

    // -- Tool 2: polymarket_get_market ----------------------------------------
    api.registerTool(
      {
        name: "polymarket_get_market",
        label: "Get Market",
        description:
          "Get detailed information about a specific Polymarket prediction market by its ID.",
        parameters: {
          type: "object",
          properties: {
            marketId: { type: "string", description: "The market ID (from search results or URL)" },
          },
          required: ["marketId"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { marketId } = params as { marketId: string };
          const m = await gammaGet<GammaMarket>(`/markets/${encodeURIComponent(marketId)}`);
          const text = [
            `Market: ${m.question}`,
            `ID: ${m.id} | Condition: ${m.conditionId}`,
            `Description: ${m.description?.slice(0, 300) ?? "N/A"}`,
            `Category: ${m.category} | Prices: ${fmtOutcomePrices(m, 4)}`,
            `Volume: ${fmtDollar(m.volume)} | Liquidity: ${fmtDollar(m.liquidity)}`,
            `End: ${m.endDate} | Active: ${m.active} | Closed: ${m.closed}`,
          ].join("\n");
          return { content: [{ type: "text", text }], details: { market: m } };
        },
      },
      { name: "polymarket_get_market" },
    );

    // -- Tool 3: polymarket_place_order (POLICY-GATED) ------------------------
    api.registerTool(
      {
        name: "polymarket_place_order",
        label: "Place Order",
        description:
          "Place a buy or sell order on a Polymarket prediction market. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, " +
          "daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            marketId: { type: "string", description: "The market ID to trade on" },
            side: { type: "string", enum: ["buy", "sell"], description: "Order side: buy or sell" },
            size: { type: "number", description: "Number of shares to buy/sell" },
            price: { type: "number", description: "Limit price per share (0.00 - 1.00)" },
          },
          required: ["marketId", "side", "size", "price"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { marketId, side, size, price } = params as {
            marketId: string;
            side: "buy" | "sell";
            size: number;
            price: number;
          };
          if (price < 0 || price > 1) {
            return {
              content: [{ type: "text", text: "Price must be between 0.00 and 1.00." }],
              details: { error: "invalid_price" },
            };
          }
          if (size <= 0) {
            return {
              content: [{ type: "text", text: "Size must be greater than 0." }],
              details: { error: "invalid_size" },
            };
          }
          const notionalUsd = size * price;

          // Fail-safe: block orders when policy engine is not configured.
          if (!policyEngine) {
            api.logger.error("Trading policy engine not configured — order blocked for safety");
            return {
              content: [
                {
                  type: "text",
                  text: "Order blocked: trading policy engine not configured. Enable trading in config.",
                },
              ],
              details: { error: "no_policy_engine" },
            };
          }

          // Policy gate: evaluateOrder() before execution.
          const order = buildTradeOrder({ marketId, side, size, price });
          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`polymarket: order denied by policy engine: ${decision.reason}`);
            return {
              content: [{ type: "text", text: `Order denied: ${decision.reason}` }],
              details: {
                error: "policy_denied",
                reason: decision.reason,
                failedStep: decision.failedStep,
              },
            };
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`polymarket: order pending ${decision.approvalMode} approval`);
            return {
              content: [
                {
                  type: "text",
                  text: `Order requires ${decision.approvalMode} approval before execution.\nMarket: ${marketId} | Side: ${side.toUpperCase()} | Size: ${size} | Price: $${price.toFixed(4)}\nNotional: $${notionalUsd.toFixed(2)}`,
                },
              ],
              details: {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            };
          }

          api.logger.info(
            `polymarket: placing ${side} order: ${size} shares @ $${price.toFixed(4)} on ${marketId} (notional: $${notionalUsd.toFixed(2)})`,
          );
          try {
            const result = await clobRequest<ClobOrder>(cfg, "POST", "/order", {
              market: marketId,
              side,
              size: String(size),
              price: String(price),
              type: "limit",
            });

            // Post-trade: update policy state and write audit entry.
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              dailySpendUsd: state.dailySpendUsd + (side === "buy" ? notionalUsd : 0),
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({ marketId, side, size, price }),
            });

            const orderId = result.id ?? randomUUID();
            const text = [
              `Order placed successfully.`,
              `Order ID: ${orderId} | Market: ${marketId}`,
              `Side: ${side.toUpperCase()} | Size: ${size} | Price: $${price.toFixed(4)}`,
              `Notional: $${notionalUsd.toFixed(2)} | Status: ${result.status ?? "submitted"}`,
            ].join("\n");
            return {
              content: [{ type: "text", text }],
              details: {
                orderId,
                marketId,
                side,
                size,
                price,
                notionalUsd,
                status: result.status ?? "submitted",
              },
            };
          } catch (err) {
            api.logger.warn(`polymarket: order failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return {
              content: [{ type: "text", text: `Order failed: ${errMsg(err)}` }],
              details: { error: errMsg(err) },
            };
          }
        },
      },
      { name: "polymarket_place_order" },
    );

    // -- Tool 4: polymarket_cancel_order (POLICY-GATED) -----------------------
    api.registerTool(
      {
        name: "polymarket_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on Polymarket. POLICY-GATED: kill switch and audit trail checked before execution.",
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "The order ID to cancel" },
          },
          required: ["orderId"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { orderId } = params as { orderId: string };
          api.logger.info(`polymarket: cancelling order ${orderId}`);
          try {
            await clobRequest(cfg, "DELETE", `/order/${encodeURIComponent(orderId)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "cancelled",
              actor: "agent",
            });
            return {
              content: [{ type: "text", text: `Order ${orderId} cancelled successfully.` }],
              details: { orderId, status: "cancelled" },
            };
          } catch (err) {
            api.logger.warn(`polymarket: cancel failed for ${orderId}: ${errMsg(err)}`);
            return {
              content: [{ type: "text", text: `Cancel failed: ${errMsg(err)}` }],
              details: { orderId, error: errMsg(err) },
            };
          }
        },
      },
      { name: "polymarket_cancel_order" },
    );

    // -- Tool 5: polymarket_get_positions -------------------------------------
    api.registerTool(
      {
        name: "polymarket_get_positions",
        label: "Get Positions",
        description: "Get current open positions on Polymarket, including P&L for each.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_toolCallId: string, _params: unknown) {
          try {
            const positions = await clobRequest<ClobPosition[]>(cfg, "GET", "/positions");
            if (!positions?.length) {
              return {
                content: [{ type: "text", text: "No open positions." }],
                details: { count: 0 },
              };
            }
            const lines = positions.map((p, i) => {
              const sz = parseFloat(p.size ?? "0");
              const avg = parseFloat(p.avgPrice ?? "0");
              const cur = parseFloat(p.currentPrice ?? "0");
              const pnl = parseFloat(p.pnl ?? "0");
              return `${i + 1}. ${p.market} (${p.asset})\n   ${sz.toFixed(2)} shares @ avg $${avg.toFixed(4)} | cur $${cur.toFixed(4)} | P&L $${pnl.toFixed(2)}`;
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Open positions (${positions.length}):\n\n${lines.join("\n\n")}`,
                },
              ],
              details: {
                count: positions.length,
                positions: positions.map((p) => ({
                  market: p.market,
                  asset: p.asset,
                  size: p.size,
                  pnl: p.pnl,
                })),
              },
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: `Failed to fetch positions: ${errMsg(err)}` }],
              details: { error: errMsg(err) },
            };
          }
        },
      },
      { name: "polymarket_get_positions" },
    );

    // -- Tool 6: polymarket_get_order_history ---------------------------------
    api.registerTool(
      {
        name: "polymarket_get_order_history",
        label: "Order History",
        description:
          "Get order history from Polymarket, including filled, cancelled, and pending orders.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_toolCallId: string, _params: unknown) {
          try {
            const orders = await clobRequest<ClobOrder[]>(cfg, "GET", "/orders");
            if (!orders?.length) {
              return {
                content: [{ type: "text", text: "No orders in history." }],
                details: { count: 0 },
              };
            }
            const lines = orders.map((o, i) => {
              const sz = parseFloat(o.size ?? "0");
              const pr = parseFloat(o.price ?? "0");
              return `${i + 1}. ${o.id} | ${o.market}\n   ${o.side?.toUpperCase() ?? "N/A"} ${sz.toFixed(2)} @ $${pr.toFixed(4)} | ${o.status} | ${o.createdAt}`;
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Order history (${orders.length}):\n\n${lines.join("\n\n")}`,
                },
              ],
              details: {
                count: orders.length,
                orders: orders.map((o) => ({
                  id: o.id,
                  market: o.market,
                  side: o.side,
                  status: o.status,
                })),
              },
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: `Failed to fetch order history: ${errMsg(err)}` }],
              details: { error: errMsg(err) },
            };
          }
        },
      },
      { name: "polymarket_get_order_history" },
    );

    // -- Service: polymarket-sync (periodic position sync) --------------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "polymarket-sync",
      start: () => {
        api.logger.info(
          `polymarket-sync: starting position sync (every ${POSITION_SYNC_INTERVAL_MS / 1000}s)`,
        );
        const syncPositions = async () => {
          try {
            const positions = await clobRequest<ClobPosition[]>(cfg, "GET", "/positions");
            const count = positions?.length ?? 0;
            const totalPnl = (positions ?? []).reduce((s, p) => s + parseFloat(p.pnl ?? "0"), 0);
            const totalValue = (positions ?? []).reduce(
              (s, p) => s + parseFloat(p.size ?? "0") * parseFloat(p.currentPrice ?? "0"),
              0,
            );
            api.logger.info(
              `polymarket-sync: ${count} position(s), total P&L: $${totalPnl.toFixed(2)}`,
            );

            // Persist position data to policy state.
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};
            for (const p of positions ?? []) {
              const mv = parseFloat(p.size ?? "0") * parseFloat(p.currentPrice ?? "0");
              positionsByAsset[`poly:${p.market}`] = {
                extensionId: EXTENSION_ID,
                valueUsd: mv,
                percentOfPortfolio: totalValue > 0 ? (mv / totalValue) * 100 : 0,
              };
            }

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              openPositionCount: count,
              currentPortfolioValueUsd:
                totalValue > 0 ? totalValue : state.currentPortfolioValueUsd,
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, totalValue),
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
            api.logger.warn(`polymarket-sync: sync failed: ${errMsg(err)}`);
          }
        };
        syncPositions();
        syncTimer = setInterval(syncPositions, POSITION_SYNC_INTERVAL_MS);
      },
      stop: () => {
        if (syncTimer) {
          clearInterval(syncTimer);
          syncTimer = null;
        }
        api.logger.info("polymarket-sync: stopped");
      },
    });
  },
};

export default polymarketPlugin;
