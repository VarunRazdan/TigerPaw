/**
 * Tigerpaw Kraken Extension
 *
 * Crypto spot and margin trading via Kraken's REST API.
 * Provides ticker lookup, asset pair search, order placement (policy-gated),
 * order cancellation, balance retrieval, open positions, and order history.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the Kraken API.
 */
import { randomUUID } from "node:crypto";
import { createHmac, createHash } from "node:crypto";
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
import { krakenConfigSchema, BASE_URL, type KrakenConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "kraken";
/** Maximum age (ms) of a price before flagging as stale. */
const STALE_PRICE_THRESHOLD_MS = 30_000;

// -- Kraken API response types -----------------------------------------------
type KrakenTicker = {
  a: [string, string, string]; // ask [price, whole lot volume, lot volume]
  b: [string, string, string]; // bid
  c: [string, string]; // last trade closed [price, lot volume]
  v: [string, string]; // volume [today, last 24h]
  p: [string, string]; // volume weighted average price
  t: [number, number]; // number of trades
  l: [string, string]; // low
  h: [string, string]; // high
  o: string; // today's opening price
};

type KrakenAssetPair = {
  altname: string;
  base: string;
  quote: string;
  status: string;
  lot_decimals: number;
  pair_decimals: number;
};

type KrakenOrderResult = {
  descr: { order: string };
  txid: string[];
};

type KrakenBalance = Record<string, string>;

type KrakenOpenPosition = {
  pair: string;
  type: string;
  vol: string;
  cost: string;
  fee: string;
  net: string;
};

type KrakenResponse<T> = {
  error: string[];
  result: T;
};

// -- Kraken request signing ---------------------------------------------------
function signKraken(path: string, nonce: string, postData: string, secret: string): string {
  const sha256 = createHash("sha256")
    .update(nonce + postData)
    .digest();
  const hmac = createHmac("sha512", Buffer.from(secret, "base64"));
  hmac.update(Buffer.concat([Buffer.from(path), sha256]));
  return hmac.digest("base64");
}

// -- API helpers (native fetch, Node 22+) ------------------------------------
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function publicReq<T>(path: string): Promise<T> {
  const url = `${BASE_URL}/0/public/${path}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Kraken Public API ${res.status}: ${t || res.statusText}`);
  }
  const data = (await res.json()) as KrakenResponse<T>;
  if (data.error?.length) throw new Error(`Kraken API error: ${data.error.join(", ")}`);
  return data.result;
}

async function privateReq<T>(
  cfg: KrakenConfig,
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const path = `/0/private/${endpoint}`;
  const nonce = Date.now().toString();
  const postParams = new URLSearchParams({ nonce, ...params });
  const postData = postParams.toString();
  const signature = signKraken(path, nonce, postData, cfg.apiSecret);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "API-Key": cfg.apiKey,
      "API-Sign": signature,
    },
    body: postData,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Kraken Private API ${res.status}: ${t || res.statusText}`);
  }
  const data = (await res.json()) as KrakenResponse<T>;
  if (data.error?.length) throw new Error(`Kraken API error: ${data.error.join(", ")}`);
  return data.result;
}

// -- Formatting helpers ------------------------------------------------------
function $(v: string | number): string {
  return `$${parseFloat(String(v || "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function txt(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function txtD(text: string, details: unknown) {
  return { ...txt(text), details };
}

// -- Policy engine helper ----------------------------------------------------
function buildTradeOrder(opts: {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  priceUsd: number;
  orderType: "market" | "limit";
  limitPrice?: number;
}): TradeOrder {
  return {
    id: randomUUID(),
    extensionId: EXTENSION_ID,
    symbol: opts.symbol,
    side: opts.side,
    quantity: opts.qty,
    priceUsd: opts.priceUsd,
    notionalUsd: opts.qty * opts.priceUsd,
    orderType: opts.orderType,
    limitPrice: opts.limitPrice,
  };
}

// -- Plugin ------------------------------------------------------------------
const krakenPlugin = {
  id: EXTENSION_ID,
  name: "Kraken",
  description: "Kraken crypto spot and margin trading extension",
  kind: "trading" as const,
  configSchema: krakenConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = krakenConfigSchema.parse(api.pluginConfig);
    api.logger.info(`kraken: plugin registered`);

    // Resolve the policy engine from the trading config on the API, if available.
    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: kraken_get_ticker --------------------------------------------
    api.registerTool(
      {
        name: "kraken_get_ticker",
        label: "Get Ticker",
        description:
          "Get ticker info for a Kraken trading pair (e.g. XBTUSD, ETHUSD). Shows bid, ask, last trade, volume, VWAP, and 24h high/low.",
        parameters: {
          type: "object",
          properties: {
            pair: { type: "string", description: "Trading pair (e.g. XBTUSD, ETHUSD, DOTUSD)" },
          },
          required: ["pair"],
        },
        async execute(_id: string, params: unknown) {
          const { pair } = params as { pair: string };
          const p = pair.toUpperCase();
          try {
            const result = await publicReq<Record<string, KrakenTicker>>(
              `Ticker?pair=${encodeURIComponent(p)}`,
            );
            const key = Object.keys(result)[0];
            if (!key) return txtD(`No ticker data found for pair "${p}".`, { error: "not_found" });
            const t = result[key];
            const text = [
              `Ticker for ${p} (${key}):`,
              `Ask: ${$(t.a[0])} (vol: ${t.a[2]}) | Bid: ${$(t.b[0])} (vol: ${t.b[2]})`,
              `Last Trade: ${$(t.c[0])} (vol: ${t.c[1]})`,
              `Volume: ${t.v[0]} (today) / ${t.v[1]} (24h)`,
              `VWAP: ${$(t.p[0])} (today) / ${$(t.p[1])} (24h)`,
              `Trades: ${t.t[0]} (today) / ${t.t[1]} (24h)`,
              `Low: ${$(t.l[0])} / ${$(t.l[1])} | High: ${$(t.h[0])} / ${$(t.h[1])}`,
              `Open: ${$(t.o)}`,
            ].join("\n");
            return txtD(text, {
              pair: p,
              key,
              ask: t.a[0],
              bid: t.b[0],
              last: t.c[0],
              volume24h: t.v[1],
              vwap24h: t.p[1],
            });
          } catch (err) {
            return txtD(`Failed to get ticker for ${p}: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kraken_get_ticker" },
    );

    // -- Tool 2: kraken_search_pairs ------------------------------------------
    api.registerTool(
      {
        name: "kraken_search_pairs",
        label: "Search Pairs",
        description:
          "Search tradeable asset pairs on Kraken. Returns matching pairs with base/quote, status, and decimal precision.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (pair name, base, or quote asset)",
            },
            limit: { type: "number", description: "Max results (default: 20)" },
          },
          required: ["query"],
        },
        async execute(_id: string, params: unknown) {
          const { query, limit = 20 } = params as { query: string; limit?: number };
          try {
            const result = await publicReq<Record<string, KrakenAssetPair>>("AssetPairs");
            const q = query.toLowerCase();
            const entries = Object.entries(result)
              .filter(
                ([key, pair]) =>
                  pair.status === "online" &&
                  (key.toLowerCase().includes(q) ||
                    pair.altname.toLowerCase().includes(q) ||
                    pair.base.toLowerCase().includes(q) ||
                    pair.quote.toLowerCase().includes(q)),
              )
              .slice(0, Math.min(Math.max(1, limit), 50));

            if (!entries.length)
              return txtD(`No tradeable pairs found matching "${query}".`, { count: 0 });
            const lines = entries.map(
              ([key, p], i) =>
                `${i + 1}. ${p.altname} (${key})\n   Base: ${p.base} | Quote: ${p.quote} | Status: ${p.status}\n   Price decimals: ${p.pair_decimals} | Lot decimals: ${p.lot_decimals}`,
            );
            return txtD(`Found ${entries.length} pair(s):\n\n${lines.join("\n\n")}`, {
              count: entries.length,
              pairs: entries.map(([key, p]) => ({
                key,
                altname: p.altname,
                base: p.base,
                quote: p.quote,
                status: p.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to search pairs: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kraken_search_pairs" },
    );

    // -- Tool 3: kraken_place_order (POLICY-GATED) ----------------------------
    api.registerTool(
      {
        name: "kraken_place_order",
        label: "Place Order",
        description:
          "Place a crypto order on Kraken. Supports market, limit, and stop-loss order types. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            pair: { type: "string", description: "Trading pair (e.g. XBTUSD)" },
            type: { type: "string", enum: ["buy", "sell"], description: "Order direction" },
            ordertype: {
              type: "string",
              enum: ["market", "limit", "stop-loss"],
              description: "Order type (default: market)",
            },
            volume: { type: "number", description: "Order volume in base currency" },
            price: {
              type: "number",
              description: "Limit price (required for limit orders) or stop-loss trigger price",
            },
            leverage: {
              type: "string",
              description: "Leverage amount (e.g. '2:1', '3:1'). Omit for no leverage.",
            },
          },
          required: ["pair", "type", "volume"],
        },
        async execute(_id: string, params: unknown) {
          const {
            pair,
            type: side,
            ordertype = "market",
            volume,
            price,
            leverage,
          } = params as {
            pair: string;
            type: "buy" | "sell";
            ordertype?: string;
            volume: number;
            price?: number;
            leverage?: string;
          };
          if (volume <= 0)
            return txtD("Volume must be greater than 0.", { error: "invalid_volume" });
          if (ordertype === "limit" && price === undefined)
            return txtD("Price is required for limit orders.", { error: "missing_price" });
          if (ordertype === "stop-loss" && price === undefined)
            return txtD("Price is required for stop-loss orders.", { error: "missing_price" });

          const p = pair.toUpperCase();

          // Estimate price for policy evaluation: use provided price, else fetch ticker.
          let estimatedPrice = price ?? 0;
          let priceStaleWarning: string | undefined;
          if (estimatedPrice === 0) {
            try {
              const tickerResult = await publicReq<Record<string, KrakenTicker>>(
                `Ticker?pair=${encodeURIComponent(p)}`,
              );
              const key = Object.keys(tickerResult)[0];
              if (key) {
                const ticker = tickerResult[key];
                estimatedPrice = side === "buy" ? parseFloat(ticker.a[0]) : parseFloat(ticker.b[0]);
                // Low trade count today suggests illiquid market / stale pricing.
                const tradesToday = ticker.t[0] ?? 0;
                if (tradesToday < 5) {
                  priceStaleWarning = `Low liquidity warning: only ${tradesToday} trade(s) today — price may be stale`;
                  api.logger.warn(`kraken: low liquidity for ${p}: ${tradesToday} trades today`);
                }
              }
            } catch {
              // If ticker fetch fails, proceed with 0 — policy engine will still check other limits.
            }
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
          const order = buildTradeOrder({
            symbol: p,
            side: side as "buy" | "sell",
            qty: volume,
            priceUsd: estimatedPrice,
            orderType: (ordertype === "market" ? "market" : "limit") as "market" | "limit",
            limitPrice: price,
          });

          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`kraken: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`kraken: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Pair: ${p} | Side: ${side.toUpperCase()} | Volume: ${volume} | Type: ${ordertype}\n` +
                `Estimated notional: ${$(volume * estimatedPrice)}\n` +
                `Timeout: ${(decision.timeoutMs ?? 0) / 1000}s`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          // Build Kraken AddOrder params
          const orderParams: Record<string, string> = {
            pair: p,
            type: side,
            ordertype,
            volume: String(volume),
          };
          if (price !== undefined) orderParams.price = String(price);
          if (leverage) orderParams.leverage = leverage;

          api.logger.info(
            `kraken: placing ${side} ${ordertype} order: ${volume} ${p}${price ? ` @ ${$(price)}` : ""}${leverage ? ` (leverage: ${leverage})` : ""}`,
          );
          try {
            const r = await privateReq<KrakenOrderResult>(cfg, "AddOrder", orderParams);

            // Post-trade: update policy state and write audit entry.
            const notionalUsd = volume * estimatedPrice;
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
              orderSnapshot: buildTradeOrder({
                symbol: p,
                side: side as "buy" | "sell",
                qty: volume,
                priceUsd: estimatedPrice,
                orderType: (ordertype === "market" ? "market" : "limit") as "market" | "limit",
                limitPrice: price,
              }),
            });

            const txids = r.txid?.join(", ") ?? "none";
            const text = [
              `Order placed successfully.`,
              `TX ID(s): ${txids}`,
              `Description: ${r.descr.order}`,
              priceStaleWarning ? `⚠ ${priceStaleWarning}` : null,
            ]
              .filter(Boolean)
              .join("\n");
            return txtD(text, { txid: r.txid, description: r.descr.order, priceStaleWarning });
          } catch (err) {
            api.logger.warn(`kraken: order failed: ${errMsg(err)}`);
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
      { name: "kraken_place_order" },
    );

    // -- Tool 4: kraken_cancel_order ------------------------------------------
    api.registerTool(
      {
        name: "kraken_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on Kraken via CancelOrder endpoint. Writes an audit trail entry.",
        parameters: {
          type: "object",
          properties: {
            txid: { type: "string", description: "Transaction ID of the order to cancel" },
          },
          required: ["txid"],
        },
        async execute(_id: string, params: unknown) {
          const { txid } = params as { txid: string };
          api.logger.info(`kraken: cancelling order ${txid}`);

          // Kill switch gate: hard mode blocks cancels, soft mode allows them.
          const killStatus = await checkKillSwitch();
          if (killStatus.active && !isOrderAllowedUnderKillSwitch(killStatus, "cancel")) {
            const reason = `kill switch active (${killStatus.mode ?? "hard"} mode): ${killStatus.reason ?? "no reason provided"}`;
            api.logger.warn(`kraken: cancel denied — ${reason}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "denied",
              actor: "system",
              error: reason,
            });
            return txtD(`Cancel denied: ${reason}`, { error: "kill_switch", reason });
          }

          try {
            const r = await privateReq<{ count: number }>(cfg, "CancelOrder", { txid });
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "cancelled",
              actor: "agent",
            });
            return txtD(`Order ${txid} cancelled successfully (${r.count} order(s) cancelled).`, {
              txid,
              count: r.count,
              status: "cancelled",
            });
          } catch (err) {
            api.logger.warn(`kraken: cancel failed for ${txid}: ${errMsg(err)}`);
            return txtD(`Cancel failed: ${errMsg(err)}`, { txid, error: errMsg(err) });
          }
        },
      },
      { name: "kraken_cancel_order" },
    );

    // -- Tool 5: kraken_get_balances ------------------------------------------
    api.registerTool(
      {
        name: "kraken_get_balances",
        label: "Get Balances",
        description:
          "Get account balances from Kraken. Returns all asset balances (e.g. XXBT, ZUSD, XETH).",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const balances = await privateReq<KrakenBalance>(cfg, "Balance");
            const entries = Object.entries(balances).filter(([, v]) => parseFloat(v) > 0);
            if (!entries.length) return txtD("No balances found.", { count: 0 });
            const lines = entries.map(
              ([asset, amount], i) => `${i + 1}. ${asset}: ${parseFloat(amount).toFixed(8)}`,
            );
            return txtD(`Account balances (${entries.length} asset(s)):\n\n${lines.join("\n")}`, {
              count: entries.length,
              balances: Object.fromEntries(entries),
            });
          } catch (err) {
            return txtD(`Failed to fetch balances: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kraken_get_balances" },
    );

    // -- Tool 6: kraken_get_positions -----------------------------------------
    api.registerTool(
      {
        name: "kraken_get_positions",
        label: "Get Open Positions",
        description:
          "Get all open margin positions on Kraken, including pair, volume, cost, fee, and net P&L.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const positions = await privateReq<Record<string, KrakenOpenPosition>>(
              cfg,
              "OpenPositions",
            );
            const entries = Object.entries(positions);
            if (!entries.length) return txtD("No open positions.", { count: 0 });
            const lines = entries.map(
              ([id, p], i) =>
                `${i + 1}. ${p.pair} (${p.type})\n   Volume: ${p.vol} | Cost: ${$(p.cost)} | Fee: ${$(p.fee)}\n   Net P&L: ${$(p.net)} | ID: ${id}`,
            );
            return txtD(`Open positions (${entries.length}):\n\n${lines.join("\n\n")}`, {
              count: entries.length,
              positions: entries.map(([id, p]) => ({
                id,
                pair: p.pair,
                type: p.type,
                vol: p.vol,
                cost: p.cost,
                net: p.net,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kraken_get_positions" },
    );

    // -- Tool 7: kraken_get_order_history -------------------------------------
    api.registerTool(
      {
        name: "kraken_get_order_history",
        label: "Order History",
        description:
          "Get closed order history from Kraken via ClosedOrders endpoint (last 50 orders).",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const result = await privateReq<{
              closed: Record<
                string,
                {
                  descr: {
                    pair: string;
                    type: string;
                    ordertype: string;
                    price: string;
                    order: string;
                  };
                  vol: string;
                  vol_exec: string;
                  cost: string;
                  fee: string;
                  status: string;
                  opentm: number;
                  closetm: number;
                }
              >;
            }>(cfg, "ClosedOrders");
            const entries = Object.entries(result.closed ?? {});
            if (!entries.length) return txtD("No closed orders in history.", { count: 0 });
            const recent = entries.slice(0, 50);
            const lines = recent.map(([id, o], i) => {
              const d = o.descr;
              return `${i + 1}. ${d.pair} | ${d.type.toUpperCase()} ${d.ordertype.toUpperCase()}\n   Vol: ${o.vol} (exec: ${o.vol_exec}) | Cost: ${$(o.cost)} | Fee: ${$(o.fee)}\n   Status: ${o.status} | ID: ${id}\n   Description: ${d.order}`;
            });
            return txtD(`Closed orders (${recent.length}):\n\n${lines.join("\n\n")}`, {
              count: recent.length,
              orders: recent.map(([id, o]) => ({
                id,
                pair: o.descr.pair,
                type: o.descr.type,
                ordertype: o.descr.ordertype,
                vol: o.vol,
                status: o.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch order history: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kraken_get_order_history" },
    );

    // -- Tool 8: kraken_close_position (POLICY-GATED) ------------------------
    api.registerTool(
      {
        name: "kraken_close_position",
        label: "Close Position",
        description:
          "Close an open position on Kraken by placing a market sell order via the AddOrder endpoint. " +
          "If quantity is omitted, the entire balance is sold. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Trading pair (e.g. XBTUSD, ETHUSD)",
            },
            quantity: {
              type: "number",
              description: "Volume of base asset to sell (omit to sell entire balance)",
            },
          },
          required: ["symbol"],
        },
        async execute(_id: string, params: unknown) {
          const { symbol, quantity } = params as { symbol: string; quantity?: number };
          const pair = symbol.toUpperCase();

          // Fetch account balances and open positions to determine position size.
          let posQty: number;
          let foundInPositions = false;
          try {
            // First check open margin positions.
            const positions = await privateReq<Record<string, KrakenOpenPosition>>(
              cfg,
              "OpenPositions",
            );
            const posEntries = Object.values(positions);
            const matched = posEntries.find((p) => p.pair === pair);
            if (matched) {
              posQty = parseFloat(matched.vol ?? "0");
              foundInPositions = true;
            } else {
              // Fall back to spot balances — resolve base asset from pair.
              const balances = await privateReq<KrakenBalance>(cfg, "Balance");
              // Try common Kraken base asset prefixes (XXBT, XETH, etc.)
              const base = pair.replace(/USD$|USDT$|EUR$/, "");
              const prefixed = `X${base}`;
              const bal = parseFloat(balances[base] ?? balances[prefixed] ?? "0");
              if (bal <= 0) {
                return txtD(`No open position found for ${pair}.`, {
                  error: "no_position",
                  symbol: pair,
                });
              }
              posQty = bal;
            }
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }

          const closeQty = quantity ?? posQty;

          if (quantity !== undefined && quantity > posQty) {
            return txtD(
              `Requested quantity (${quantity}) exceeds position size (${posQty}) for ${pair}.`,
              { error: "invalid_quantity", requested: quantity, positionSize: posQty },
            );
          }

          // Fetch current price.
          let currentPrice = 0;
          try {
            const tickerResult = await publicReq<Record<string, KrakenTicker>>(
              `Ticker?pair=${encodeURIComponent(pair)}`,
            );
            const key = Object.keys(tickerResult)[0];
            if (key) {
              currentPrice = parseFloat(tickerResult[key].b[0]);
            }
          } catch {
            // If ticker fetch fails, proceed with 0.
          }

          // Fail-safe: block when policy engine is not configured.
          if (!policyEngine) {
            api.logger.error("Trading policy engine not configured — order blocked for safety");
            return txtD(
              "Order blocked: trading policy engine not configured. Enable trading in config.",
              { error: "no_policy_engine" },
            );
          }

          // Policy gate: evaluateOrder() before execution.
          const order = buildTradeOrder({
            symbol: pair,
            side: "sell",
            qty: closeQty,
            priceUsd: currentPrice,
            orderType: "market",
          });
          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`kraken: close position denied by policy engine: ${decision.reason}`);
            return txtD(`Close position denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`kraken: close position pending ${decision.approvalMode} approval`);
            return txtD(
              `Close position requires ${decision.approvalMode} approval before execution.\n` +
                `Pair: ${pair} | Qty: ${closeQty} of ${posQty} | Price: ${$(currentPrice)}\n` +
                `Estimated notional: ${$(closeQty * currentPrice)}`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          // Execute close via Kraken AddOrder (market sell).
          const orderParams: Record<string, string> = {
            pair,
            type: "sell",
            ordertype: "market",
            volume: String(closeQty),
          };

          api.logger.info(
            `kraken: closing ${closeQty} of ${posQty} on ${pair} @ ~${$(currentPrice)}`,
          );
          try {
            const r = await privateReq<KrakenOrderResult>(cfg, "AddOrder", orderParams);

            // Post-trade: update policy state (no dailySpendUsd for sells).
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({
                symbol: pair,
                side: "sell",
                qty: closeQty,
                priceUsd: currentPrice,
                orderType: "market",
              }),
            });

            const txids = r.txid?.join(", ") ?? "none";
            const text = [
              `Position close submitted.`,
              `TX ID(s): ${txids}`,
              `Closed: ${closeQty} of ${posQty} on ${pair}`,
              `Description: ${r.descr.order}`,
            ].join("\n");
            return txtD(text, {
              txid: r.txid,
              closedQty: closeQty,
              positionQty: posQty,
              description: r.descr.order,
            });
          } catch (err) {
            api.logger.warn(`kraken: close position failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return txtD(`Close position failed: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "kraken_close_position" },
    );

    // -- Service: kraken-sync (periodic balance/position sync) ----------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "kraken-sync",
      start: () => {
        const syncMs = cfg.syncIntervalMs ?? SYNC_INTERVAL_MS;
        api.logger.info(`kraken-sync: starting balance/position sync (every ${syncMs / 1000}s)`);
        const sync = async () => {
          try {
            const [balances, positions] = await Promise.all([
              privateReq<KrakenBalance>(cfg, "Balance"),
              privateReq<Record<string, KrakenOpenPosition>>(cfg, "OpenPositions"),
            ]);

            const posEntries = Object.entries(positions);
            const posCount = posEntries.length;
            const totalCost = posEntries.reduce((s, [, p]) => s + parseFloat(p.cost ?? "0"), 0);
            const totalNet = posEntries.reduce((s, [, p]) => s + parseFloat(p.net ?? "0"), 0);

            // Estimate portfolio value from USD-like balances
            const usdKeys = ["ZUSD", "USD", "USDT", "USDC"];
            const usdBalance = usdKeys.reduce((s, k) => s + parseFloat(balances[k] ?? "0"), 0);

            api.logger.info(
              `kraken-sync: ${posCount} position(s), total cost: ${$(totalCost)}, net P&L: ${$(totalNet)}, USD balance: ${$(usdBalance)}`,
            );

            // Persist position data to policy state for cross-extension risk checks.
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};
            const estimatedPortfolio = usdBalance + totalCost;
            for (const [, p] of posEntries) {
              const cost = parseFloat(p.cost ?? "0");
              positionsByAsset[p.pair] = {
                extensionId: EXTENSION_ID,
                valueUsd: cost,
                percentOfPortfolio: estimatedPortfolio > 0 ? (cost / estimatedPortfolio) * 100 : 0,
              };
            }

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              ...withPlatformPositionCount(state, EXTENSION_ID, posCount),
              ...withPlatformPortfolio(state, EXTENSION_ID, estimatedPortfolio),
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, estimatedPortfolio),
              positionsByAsset: { ...state.positionsByAsset, ...positionsByAsset },
            }));

            // Auto-activate kill switch if risk thresholds are breached.
            if (policyEngine) {
              await autoActivateIfBreached(updatedState, {
                dailyLossLimitPercent: api.tradingPolicyConfig?.limits.dailyLossLimitPercent ?? 10,
                maxPortfolioDrawdownPercent:
                  api.tradingPolicyConfig?.limits.maxPortfolioDrawdownPercent ?? 20,
                consecutiveLossPause: api.tradingPolicyConfig?.limits.consecutiveLossPause ?? 5,
              });
            }
          } catch (err) {
            api.logger.warn(`kraken-sync: sync failed: ${errMsg(err)}`);
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
        api.logger.info("kraken-sync: stopped");
      },
    });
  },
};

export default krakenPlugin;
