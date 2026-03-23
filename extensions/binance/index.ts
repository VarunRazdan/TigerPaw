/**
 * Tigerpaw Binance Extension
 *
 * Crypto spot trading via Binance's REST API.
 * Provides symbol search, price retrieval, order placement (policy-gated),
 * OCO orders, order cancellation, balance tracking, open orders, trade
 * history, and a background sync service.
 *
 * All order placement tools are gated by the TradingPolicyEngine — every
 * order goes through evaluateOrder() before reaching the Binance API.
 *
 * Binance uses HMAC-SHA256 signed requests for authenticated endpoints.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  TradingPolicyEngine,
  writeAuditEntry,
  updatePolicyState,
  withPlatformPortfolio,
  withPlatformPositionCount,
  autoActivateIfBreached,
  type TradeOrder,
} from "tigerpaw/trading";
import { binanceConfigSchema, getBaseUrl, type BinanceConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "binance";
/** Maximum age (ms) of a price before flagging as stale. */
const STALE_PRICE_THRESHOLD_MS = 30_000;

// -- HMAC-SHA256 signing (Binance auth) --------------------------------------

function signQuery(params: Record<string, string>, secret: string): string {
  const qs = new URLSearchParams(params).toString();
  const sig = createHmac("sha256", secret).update(qs).digest("hex");
  return `${qs}&signature=${sig}`;
}

// -- API helpers (native fetch, Node 22+) ------------------------------------

function buildHeaders(cfg: BinanceConfig) {
  return { "Content-Type": "application/json", "X-MBX-APIKEY": cfg.apiKey };
}

async function signedReq<T>(
  cfg: BinanceConfig,
  method: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const allParams = { ...params, timestamp: Date.now().toString(), recvWindow: "5000" };
  const qs = signQuery(allParams, cfg.apiSecret);
  const url = `${getBaseUrl(cfg.mode)}${path}?${qs}`;
  const res = await fetch(url, { method, headers: buildHeaders(cfg) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Binance API ${res.status}: ${t || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function publicReq<T>(
  cfg: BinanceConfig,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${getBaseUrl(cfg.mode)}${path}?${qs}` : `${getBaseUrl(cfg.mode)}${path}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Binance API ${res.status}: ${t || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Binance API response types ----------------------------------------------
type TickerPrice = { symbol: string; price: string };
type Ticker24hr = { symbol: string; lastPrice: string; closeTime: number };
type ExchangeInfoSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: unknown[];
};
type ExchangeInfo = { symbols: ExchangeInfoSymbol[] };
type Order = {
  orderId: number;
  symbol: string;
  side: string;
  type: string;
  status: string;
  origQty: string;
  executedQty: string;
  price: string;
  stopPrice: string;
  time: number;
};
type Balance = { asset: string; free: string; locked: string };
type AccountInfo = { balances: Balance[] };
type OcoOrder = {
  orderListId: number;
  contingencyType: string;
  listStatusType: string;
  orders: Array<{ symbol: string; orderId: number; clientOrderId: string }>;
};

// -- Formatting helpers ------------------------------------------------------
function $(v: string | number): string {
  return `$${parseFloat(String(v || "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
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
const binancePlugin = {
  id: EXTENSION_ID,
  name: "Binance",
  description: "Binance crypto spot trading extension",
  kind: "trading" as const,
  configSchema: binanceConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = binanceConfigSchema.parse(api.pluginConfig);
    api.logger.info(`binance: plugin registered (mode: ${cfg.mode})`);

    // Resolve the policy engine from the trading config on the API, if available.
    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: binance_get_price --------------------------------------------
    api.registerTool(
      {
        name: "binance_get_price",
        label: "Get Price",
        description: "Get the latest price for a trading pair on Binance (e.g. BTCUSDT, ETHUSDT).",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Trading pair symbol (e.g. BTCUSDT)" },
          },
          required: ["symbol"],
        },
        async execute(_id: string, params: unknown) {
          const sym = (params as { symbol: string }).symbol.toUpperCase();
          try {
            const data = await publicReq<TickerPrice>(cfg, "/api/v3/ticker/price", { symbol: sym });
            const price = parseFloat(data.price);
            const text = `Price for ${data.symbol}: ${$(price)}`;
            return txtD(text, { symbol: data.symbol, price: data.price });
          } catch (err) {
            return txtD(`Failed to get price for ${sym}: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "binance_get_price" },
    );

    // -- Tool 2: binance_search_symbols ---------------------------------------
    api.registerTool(
      {
        name: "binance_search_symbols",
        label: "Search Symbols",
        description:
          "Search Binance exchange info for tradeable pairs. Returns matching symbols with base/quote asset and status.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (symbol, base asset, or quote asset)",
            },
            limit: { type: "number", description: "Max results (default: 20)" },
          },
          required: ["query"],
        },
        async execute(_id: string, params: unknown) {
          const { query, limit = 20 } = params as { query: string; limit?: number };
          try {
            const info = await publicReq<ExchangeInfo>(cfg, "/api/v3/exchangeInfo");
            const q = query.toUpperCase();
            const filtered = info.symbols
              .filter(
                (s) =>
                  s.status === "TRADING" &&
                  (s.symbol.includes(q) || s.baseAsset.includes(q) || s.quoteAsset.includes(q)),
              )
              .slice(0, Math.min(Math.max(1, limit), 50));
            if (!filtered.length)
              return txtD(`No tradeable pairs found matching "${query}".`, { count: 0 });
            const lines = filtered.map(
              (s, i) =>
                `${i + 1}. ${s.symbol}\n   Base: ${s.baseAsset} | Quote: ${s.quoteAsset} | Status: ${s.status}`,
            );
            return txtD(`Found ${filtered.length} pair(s):\n\n${lines.join("\n\n")}`, {
              count: filtered.length,
              symbols: filtered.map((s) => ({
                symbol: s.symbol,
                baseAsset: s.baseAsset,
                quoteAsset: s.quoteAsset,
                status: s.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to search symbols: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "binance_search_symbols" },
    );

    // -- Tool 3: binance_place_order (POLICY-GATED) ---------------------------
    api.registerTool(
      {
        name: "binance_place_order",
        label: "Place Order",
        description:
          "Place a crypto spot order on Binance. Supports MARKET, LIMIT, and STOP_LOSS_LIMIT order types. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Trading pair symbol (e.g. BTCUSDT)" },
            side: { type: "string", enum: ["BUY", "SELL"], description: "Order side" },
            type: {
              type: "string",
              enum: ["MARKET", "LIMIT", "STOP_LOSS_LIMIT"],
              description: "Order type (default: MARKET)",
            },
            quantity: { type: "number", description: "Quantity of the base asset to trade" },
            price: {
              type: "number",
              description: "Limit price (required for LIMIT and STOP_LOSS_LIMIT)",
            },
            stopPrice: {
              type: "number",
              description: "Stop trigger price (required for STOP_LOSS_LIMIT)",
            },
            timeInForce: {
              type: "string",
              enum: ["GTC", "IOC", "FOK"],
              description: "Time in force (default: GTC, required for LIMIT)",
            },
          },
          required: ["symbol", "side", "quantity"],
        },
        async execute(_id: string, params: unknown) {
          const {
            symbol,
            side,
            type = "MARKET",
            quantity,
            price,
            stopPrice,
            timeInForce = "GTC",
          } = params as {
            symbol: string;
            side: "BUY" | "SELL";
            type?: string;
            quantity: number;
            price?: number;
            stopPrice?: number;
            timeInForce?: string;
          };
          if (quantity <= 0)
            return txtD("Quantity must be greater than 0.", { error: "invalid_qty" });
          if ((type === "LIMIT" || type === "STOP_LOSS_LIMIT") && price === undefined)
            return txtD(`Price is required for ${type} orders.`, { error: "missing_price" });
          if (type === "STOP_LOSS_LIMIT" && stopPrice === undefined)
            return txtD("stopPrice is required for STOP_LOSS_LIMIT orders.", {
              error: "missing_stop_price",
            });

          const sym = symbol.toUpperCase();
          const sideNorm = side.toLowerCase() as "buy" | "sell";

          // Estimate price for policy evaluation: use limit price if available, else fetch latest.
          let estimatedPrice = price ?? stopPrice ?? 0;
          let priceStaleWarning: string | undefined;
          if (estimatedPrice === 0) {
            try {
              const ticker = await publicReq<Ticker24hr>(cfg, "/api/v3/ticker/24hr", {
                symbol: sym,
              });
              estimatedPrice = parseFloat(ticker.lastPrice);
              const age = Date.now() - ticker.closeTime;
              if (age > STALE_PRICE_THRESHOLD_MS) {
                priceStaleWarning = `Price data is ${Math.round(age / 1000)}s old — market may have low liquidity`;
                api.logger.warn(`binance: stale price for ${sym}: ${Math.round(age / 1000)}s old`);
              }
            } catch {
              // If price fetch fails, proceed with 0 — policy engine will still check other limits.
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
            symbol: sym,
            side: sideNorm,
            qty: quantity,
            priceUsd: estimatedPrice,
            orderType: type === "MARKET" ? "market" : "limit",
            limitPrice: price,
          });

          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`binance: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`binance: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Symbol: ${sym} | Side: ${side} | Qty: ${quantity} | Type: ${type}\n` +
                `Estimated notional: ${$(quantity * estimatedPrice)}\n` +
                `Timeout: ${(decision.timeoutMs ?? 0) / 1000}s`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          const orderParams: Record<string, string> = {
            symbol: sym,
            side,
            type,
            quantity: String(quantity),
          };
          if (price !== undefined) orderParams.price = String(price);
          if (stopPrice !== undefined) orderParams.stopPrice = String(stopPrice);
          if (type === "LIMIT" || type === "STOP_LOSS_LIMIT") orderParams.timeInForce = timeInForce;

          api.logger.info(`binance: placing ${side} ${type} order: ${quantity} ${sym}`);
          try {
            const r = await signedReq<Order>(cfg, "POST", "/api/v3/order", orderParams);

            // Post-trade: update policy state and write audit entry.
            const notionalUsd = quantity * estimatedPrice;
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              dailySpendUsd: state.dailySpendUsd + (sideNorm === "buy" ? notionalUsd : 0),
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({
                symbol: sym,
                side: sideNorm,
                qty: quantity,
                priceUsd: estimatedPrice,
                orderType: type === "MARKET" ? "market" : "limit",
                limitPrice: price,
              }),
            });

            const text = [
              `Order placed successfully.`,
              `Order ID: ${r.orderId} | Symbol: ${r.symbol}`,
              `Side: ${r.side} | Qty: ${r.origQty} (filled: ${r.executedQty}) | Type: ${r.type}`,
              `Status: ${r.status}`,
              r.price !== "0.00000000" ? `Price: ${$(r.price)}` : null,
              r.stopPrice !== "0.00000000" ? `Stop Price: ${$(r.stopPrice)}` : null,
              priceStaleWarning ? `⚠ ${priceStaleWarning}` : null,
            ]
              .filter(Boolean)
              .join("\n");
            return txtD(text, {
              orderId: r.orderId,
              symbol: r.symbol,
              side: r.side,
              qty: r.origQty,
              type: r.type,
              status: r.status,
              priceStaleWarning,
            });
          } catch (err) {
            api.logger.warn(`binance: order failed: ${errMsg(err)}`);
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
      { name: "binance_place_order" },
    );

    // -- Tool 4: binance_place_oco_order (POLICY-GATED) -----------------------
    api.registerTool(
      {
        name: "binance_place_oco_order",
        label: "Place OCO Order",
        description:
          "Place a one-cancels-the-other (OCO) order on Binance with stop-loss and take-profit legs. " +
          "POLICY-GATED: TradingPolicyEngine evaluates the order before execution.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Trading pair symbol (e.g. BTCUSDT)" },
            side: { type: "string", enum: ["BUY", "SELL"], description: "Order side" },
            quantity: { type: "number", description: "Quantity of the base asset" },
            price: { type: "number", description: "Limit price (take-profit leg)" },
            stopPrice: { type: "number", description: "Stop trigger price (stop-loss leg)" },
            stopLimitPrice: {
              type: "number",
              description: "Stop-limit price for the stop-loss leg",
            },
            stopLimitTimeInForce: {
              type: "string",
              enum: ["GTC", "IOC", "FOK"],
              description: "Time in force for stop-limit leg (default: GTC)",
            },
          },
          required: ["symbol", "side", "quantity", "price", "stopPrice", "stopLimitPrice"],
        },
        async execute(_id: string, params: unknown) {
          const {
            symbol,
            side,
            quantity,
            price,
            stopPrice,
            stopLimitPrice,
            stopLimitTimeInForce = "GTC",
          } = params as {
            symbol: string;
            side: "BUY" | "SELL";
            quantity: number;
            price: number;
            stopPrice: number;
            stopLimitPrice: number;
            stopLimitTimeInForce?: string;
          };
          if (quantity <= 0)
            return txtD("Quantity must be greater than 0.", { error: "invalid_qty" });

          const sym = symbol.toUpperCase();
          const sideNorm = side.toLowerCase() as "buy" | "sell";
          const estimatedPrice = price;

          // Fail-safe: block orders when policy engine is not configured.
          if (!policyEngine) {
            api.logger.error("Trading policy engine not configured — order blocked for safety");
            return txtD(
              "Order blocked: trading policy engine not configured. Enable trading in config.",
              { error: "no_policy_engine" },
            );
          }

          // Policy gate
          const order = buildTradeOrder({
            symbol: sym,
            side: sideNorm,
            qty: quantity,
            priceUsd: estimatedPrice,
            orderType: "limit",
            limitPrice: price,
          });
          const decision = await policyEngine.evaluateOrder(order);
          if (decision.outcome === "denied") {
            return txtD(`OCO order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }
          if (decision.outcome === "pending_confirmation") {
            return txtD(
              `OCO order requires ${decision.approvalMode} approval.\nSymbol: ${sym} | ${side} ${quantity}\nTP: ${$(price)} | SL: ${$(stopPrice)} / ${$(stopLimitPrice)}`,
              { status: "pending_confirmation", approvalMode: decision.approvalMode },
            );
          }

          const orderParams: Record<string, string> = {
            symbol: sym,
            side,
            quantity: String(quantity),
            price: String(price),
            stopPrice: String(stopPrice),
            stopLimitPrice: String(stopLimitPrice),
            stopLimitTimeInForce,
          };

          api.logger.info(
            `binance: placing OCO order: ${side} ${quantity} ${sym} | TP: ${$(price)} | SL: ${$(stopPrice)}`,
          );
          try {
            const r = await signedReq<OcoOrder>(cfg, "POST", "/api/v3/order/oco", orderParams);

            const notionalUsd = quantity * estimatedPrice;
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              dailySpendUsd: state.dailySpendUsd + (sideNorm === "buy" ? notionalUsd : 0),
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({
                symbol: sym,
                side: sideNorm,
                qty: quantity,
                priceUsd: estimatedPrice,
                orderType: "limit",
                limitPrice: price,
              }),
            });

            const orderLines = r.orders
              .map(
                (o) => `  - ${o.symbol} | Order ID: ${o.orderId} | Client ID: ${o.clientOrderId}`,
              )
              .join("\n");
            const text = [
              `OCO order placed successfully.`,
              `Order List ID: ${r.orderListId} | Type: ${r.contingencyType}`,
              `Status: ${r.listStatusType}`,
              `Orders:\n${orderLines}`,
            ].join("\n");
            return txtD(text, {
              orderListId: r.orderListId,
              contingencyType: r.contingencyType,
              status: r.listStatusType,
              orders: r.orders,
            });
          } catch (err) {
            api.logger.warn(`binance: OCO order failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return txtD(`OCO order failed: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "binance_place_oco_order" },
    );

    // -- Tool 5: binance_cancel_order -----------------------------------------
    api.registerTool(
      {
        name: "binance_cancel_order",
        label: "Cancel Order",
        description: "Cancel an existing order on Binance. Audit trail is recorded.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Trading pair symbol (e.g. BTCUSDT)" },
            orderId: { type: "number", description: "The order ID to cancel" },
          },
          required: ["symbol", "orderId"],
        },
        async execute(_id: string, params: unknown) {
          const { symbol, orderId } = params as { symbol: string; orderId: number };
          const sym = symbol.toUpperCase();
          api.logger.info(`binance: cancelling order ${orderId} on ${sym}`);
          try {
            const r = await signedReq<Order>(cfg, "DELETE", "/api/v3/order", {
              symbol: sym,
              orderId: String(orderId),
            });
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "cancelled",
              actor: "agent",
            });
            return txtD(
              `Order ${r.orderId} on ${r.symbol} cancelled successfully. Status: ${r.status}`,
              { orderId: r.orderId, symbol: r.symbol, status: r.status },
            );
          } catch (err) {
            api.logger.warn(`binance: cancel failed for ${orderId}: ${errMsg(err)}`);
            return txtD(`Cancel failed: ${errMsg(err)}`, { orderId, error: errMsg(err) });
          }
        },
      },
      { name: "binance_cancel_order" },
    );

    // -- Tool 6: binance_get_balances -----------------------------------------
    api.registerTool(
      {
        name: "binance_get_balances",
        label: "Get Balances",
        description:
          "Get account balances from Binance, showing free and locked amounts for each asset.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const account = await signedReq<AccountInfo>(cfg, "GET", "/api/v3/account");
            const nonZero = account.balances.filter(
              (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0,
            );
            if (!nonZero.length) return txtD("No balances found.", { count: 0 });
            const lines = nonZero.map(
              (b, i) => `${i + 1}. ${b.asset}\n   Free: ${b.free} | Locked: ${b.locked}`,
            );
            return txtD(`Balances (${nonZero.length} asset(s)):\n\n${lines.join("\n\n")}`, {
              count: nonZero.length,
              balances: nonZero.map((b) => ({ asset: b.asset, free: b.free, locked: b.locked })),
            });
          } catch (err) {
            return txtD(`Failed to fetch balances: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "binance_get_balances" },
    );

    // -- Tool 7: binance_get_open_orders --------------------------------------
    api.registerTool(
      {
        name: "binance_get_open_orders",
        label: "Get Open Orders",
        description: "Get all open orders on Binance, optionally filtered by symbol.",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Trading pair symbol to filter (optional, e.g. BTCUSDT)",
            },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const { symbol } = params as { symbol?: string };
          try {
            const reqParams: Record<string, string> = {};
            if (symbol) reqParams.symbol = symbol.toUpperCase();
            const orders = await signedReq<Order[]>(cfg, "GET", "/api/v3/openOrders", reqParams);
            if (!orders?.length) return txtD("No open orders.", { count: 0 });
            const lines = orders.map((o, i) => {
              const priceStr = o.price !== "0.00000000" ? $(o.price) : "MKT";
              return `${i + 1}. ${o.symbol} | ${o.side} ${o.type}\n   Qty: ${o.origQty} (filled: ${o.executedQty}) | Price: ${priceStr}\n   Status: ${o.status} | Order ID: ${o.orderId}`;
            });
            return txtD(`Open orders (${orders.length}):\n\n${lines.join("\n\n")}`, {
              count: orders.length,
              orders: orders.map((o) => ({
                orderId: o.orderId,
                symbol: o.symbol,
                side: o.side,
                type: o.type,
                qty: o.origQty,
                status: o.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch open orders: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "binance_get_open_orders" },
    );

    // -- Tool 8: binance_get_order_history ------------------------------------
    api.registerTool(
      {
        name: "binance_get_order_history",
        label: "Order History",
        description: "Get recent trades/fills from Binance for a given symbol (last 50).",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Trading pair symbol (e.g. BTCUSDT)" },
            limit: { type: "number", description: "Max results (default: 50)" },
          },
          required: ["symbol"],
        },
        async execute(_id: string, params: unknown) {
          const { symbol, limit = 50 } = params as { symbol: string; limit?: number };
          const sym = symbol.toUpperCase();
          try {
            const orders = await signedReq<Order[]>(cfg, "GET", "/api/v3/allOrders", {
              symbol: sym,
              limit: String(Math.min(Math.max(1, limit), 500)),
            });
            if (!orders?.length) return txtD(`No order history for ${sym}.`, { count: 0 });
            const lines = orders.map((o, i) => {
              const priceStr = o.price !== "0.00000000" ? $(o.price) : "MKT";
              return `${i + 1}. ${o.symbol} | ${o.side} ${o.type}\n   Qty: ${o.origQty} (filled: ${o.executedQty}) | Price: ${priceStr}\n   Status: ${o.status} | Order ID: ${o.orderId} | Time: ${new Date(o.time).toISOString()}`;
            });
            return txtD(`Order history for ${sym} (${orders.length}):\n\n${lines.join("\n\n")}`, {
              count: orders.length,
              orders: orders.map((o) => ({
                orderId: o.orderId,
                symbol: o.symbol,
                side: o.side,
                type: o.type,
                qty: o.origQty,
                status: o.status,
                time: o.time,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch order history: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "binance_get_order_history" },
    );

    // -- Service: binance-sync (periodic balance sync + risk checks) ----------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "binance-sync",
      start: () => {
        const syncMs = cfg.syncIntervalMs ?? SYNC_INTERVAL_MS;
        api.logger.info(`binance-sync: starting balance sync (every ${syncMs / 1000}s)`);
        const sync = async () => {
          try {
            const account = await signedReq<AccountInfo>(cfg, "GET", "/api/v3/account");
            const nonZero = account.balances.filter(
              (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0,
            );

            // Estimate total portfolio value in USD using USDT balances as proxy.
            // For a full implementation, you'd fetch all ticker prices and convert.
            let estimatedUsdValue = 0;
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};

            for (const b of nonZero) {
              const total = parseFloat(b.free) + parseFloat(b.locked);
              if (
                b.asset === "USDT" ||
                b.asset === "USDC" ||
                b.asset === "BUSD" ||
                b.asset === "USD"
              ) {
                estimatedUsdValue += total;
                positionsByAsset[b.asset] = {
                  extensionId: EXTENSION_ID,
                  valueUsd: total,
                  percentOfPortfolio: 0,
                };
              } else {
                // Try to get USD price for non-stablecoin assets.
                try {
                  const ticker = await publicReq<TickerPrice>(cfg, "/api/v3/ticker/price", {
                    symbol: `${b.asset}USDT`,
                  });
                  const usdValue = total * parseFloat(ticker.price);
                  estimatedUsdValue += usdValue;
                  positionsByAsset[b.asset] = {
                    extensionId: EXTENSION_ID,
                    valueUsd: usdValue,
                    percentOfPortfolio: 0,
                  };
                } catch {
                  // Skip assets without a USDT pair.
                }
              }
            }

            // Update portfolio percentages.
            if (estimatedUsdValue > 0) {
              for (const key of Object.keys(positionsByAsset)) {
                positionsByAsset[key].percentOfPortfolio =
                  (positionsByAsset[key].valueUsd / estimatedUsdValue) * 100;
              }
            }

            api.logger.info(
              `binance-sync: ${nonZero.length} asset(s), estimated portfolio: ${$(estimatedUsdValue)}`,
            );

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              ...withPlatformPositionCount(state, EXTENSION_ID, nonZero.length),
              ...withPlatformPortfolio(state, EXTENSION_ID, estimatedUsdValue),
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, estimatedUsdValue),
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
            api.logger.warn(`binance-sync: sync failed: ${errMsg(err)}`);
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
        api.logger.info("binance-sync: stopped");
      },
    });
  },
};

export default binancePlugin;
