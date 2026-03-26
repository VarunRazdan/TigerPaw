/**
 * Tigerpaw Alpaca Extension
 *
 * Stock trading via Alpaca's Trading and Market Data APIs.
 * Provides asset search, quote retrieval, order placement (policy-gated),
 * position tracking, account info, and a background sync service with
 * Pattern Day Trader (PDT) rule warnings.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the Alpaca API.
 */
import { randomUUID } from "node:crypto";
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
import { alpacaConfigSchema, getBaseUrl, DATA_BASE_URL, type AlpacaConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 30_000;
const PDT_LIMIT = 3;
const PDT_EQUITY_THRESHOLD = 25_000;
const EXTENSION_ID = "alpaca";

// -- API helpers (native fetch, Node 22+) ------------------------------------
function buildHeaders(cfg: AlpacaConfig) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "APCA-API-KEY-ID": cfg.apiKeyId,
    "APCA-API-SECRET-KEY": cfg.apiSecretKey,
  };
}

async function tradingReq<T>(
  cfg: AlpacaConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${getBaseUrl(cfg.mode)}${path}`, {
    method,
    headers: buildHeaders(cfg),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Alpaca Trading API ${res.status}: ${t || res.statusText}`);
  }
  if (res.status === 204) return {} as T; // DELETE returns 204 No Content
  return res.json() as Promise<T>;
}

async function dataReq<T>(cfg: AlpacaConfig, path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE_URL}${path}`, { method: "GET", headers: buildHeaders(cfg) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Alpaca Data API ${res.status}: ${t || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Alpaca API response types -----------------------------------------------
type Asset = {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  fractionable: boolean;
};
type Quote = {
  quote: { ap: number; as: number; bp: number; bs: number; t: string };
  symbol: string;
};
type Order = {
  id: string;
  client_order_id: string;
  status: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: string;
  type: string;
  time_in_force: string;
  limit_price: string | null;
  filled_avg_price: string | null;
  created_at: string;
  submitted_at: string;
};
type Position = {
  asset_id: string;
  symbol: string;
  exchange: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
};
type Account = {
  id: string;
  account_number: string;
  status: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  pattern_day_trader: boolean;
  daytrade_count: number;
  daytrading_buying_power: string;
};

// -- Formatting helpers ------------------------------------------------------
function $(v: string | number): string {
  return `$${parseFloat(String(v || "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(v: string | number): string {
  return `${(parseFloat(String(v || "0")) * 100).toFixed(2)}%`;
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
const alpacaPlugin = {
  id: EXTENSION_ID,
  name: "Alpaca",
  description: "Alpaca stock trading extension",
  kind: "trading" as const,
  configSchema: alpacaConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = alpacaConfigSchema.parse(api.pluginConfig);
    api.logger.info(`alpaca: plugin registered (mode: ${cfg.mode})`);

    // Resolve the policy engine from the trading config on the API, if available.
    // Extensions receive the trading policy config via api.tradingPolicyConfig when
    // the operator has configured trading settings.
    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: alpaca_search_assets ----------------------------------------
    api.registerTool(
      {
        name: "alpaca_search_assets",
        label: "Search Assets",
        description:
          "Search for tradeable stock assets on Alpaca. Returns matching US equity assets with exchange and tradability info.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query (symbol or company name)" },
            limit: { type: "number", description: "Max results (default: 20)" },
          },
          required: ["query"],
        },
        async execute(_id: string, params: unknown) {
          const { query, limit = 20 } = params as { query: string; limit?: number };
          const assets = await tradingReq<Asset[]>(
            cfg,
            "GET",
            `/v2/assets?status=active&asset_class=us_equity`,
          );
          const q = query.toLowerCase();
          const filtered = assets
            .filter(
              (a) =>
                a.tradable &&
                (a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
            )
            .slice(0, Math.min(Math.max(1, limit), 50));
          if (!filtered.length)
            return txtD(`No tradeable assets found matching "${query}".`, { count: 0 });
          const lines = filtered.map(
            (a, i) =>
              `${i + 1}. ${a.symbol} - ${a.name}\n   Exchange: ${a.exchange} | Tradable: ${a.tradable} | Fractionable: ${a.fractionable}`,
          );
          return txtD(`Found ${filtered.length} asset(s):\n\n${lines.join("\n\n")}`, {
            count: filtered.length,
            assets: filtered.map((a) => ({
              symbol: a.symbol,
              name: a.name,
              exchange: a.exchange,
              tradable: a.tradable,
            })),
          });
        },
      },
      { name: "alpaca_search_assets" },
    );

    // -- Tool 2: alpaca_get_quote --------------------------------------------
    api.registerTool(
      {
        name: "alpaca_get_quote",
        label: "Get Quote",
        description: "Get the latest quote for a stock symbol, including bid/ask prices and sizes.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL, TSLA)" },
          },
          required: ["symbol"],
        },
        async execute(_id: string, params: unknown) {
          const sym = (params as { symbol: string }).symbol.toUpperCase();
          try {
            const data = await dataReq<Quote>(
              cfg,
              `/v2/stocks/${encodeURIComponent(sym)}/quotes/latest`,
            );
            const q = data.quote;
            const text = `Quote for ${sym}:\nBid: ${$(q.bp)} x ${q.bs} | Ask: ${$(q.ap)} x ${q.as}\nMid: ${$((q.bp + q.ap) / 2)} | Spread: ${$(q.ap - q.bp)}\nTimestamp: ${q.t}`;
            return txtD(text, {
              symbol: sym,
              bid: q.bp,
              ask: q.ap,
              bidSize: q.bs,
              askSize: q.as,
              timestamp: q.t,
            });
          } catch (err) {
            return txtD(`Failed to get quote for ${sym}: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "alpaca_get_quote" },
    );

    // -- Tool 3: alpaca_place_order (POLICY-GATED) ---------------------------
    api.registerTool(
      {
        name: "alpaca_place_order",
        label: "Place Order",
        description:
          "Place a stock order on Alpaca. Supports market, limit, stop, and stop_limit order types. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)" },
            qty: { type: "number", description: "Number of shares to trade" },
            side: { type: "string", enum: ["buy", "sell"], description: "Order side" },
            type: {
              type: "string",
              enum: ["market", "limit", "stop", "stop_limit"],
              description: "Order type (default: market)",
            },
            time_in_force: {
              type: "string",
              enum: ["day", "gtc", "opg", "cls", "ioc", "fok"],
              description: "Time in force (default: day)",
            },
            limit_price: {
              type: "number",
              description: "Limit price (required for limit/stop_limit)",
            },
            stop_price: {
              type: "number",
              description: "Stop price (required for stop/stop_limit)",
            },
          },
          required: ["symbol", "qty", "side"],
        },
        async execute(_id: string, params: unknown) {
          const {
            symbol,
            qty,
            side,
            type = "market",
            time_in_force = "day",
            limit_price,
            stop_price,
          } = params as {
            symbol: string;
            qty: number;
            side: "buy" | "sell";
            type?: string;
            time_in_force?: string;
            limit_price?: number;
            stop_price?: number;
          };
          if (qty <= 0) return txtD("Quantity must be greater than 0.", { error: "invalid_qty" });
          if ((type === "limit" || type === "stop_limit") && limit_price === undefined)
            return txtD(`Limit price is required for ${type} orders.`, {
              error: "missing_limit_price",
            });
          if ((type === "stop" || type === "stop_limit") && stop_price === undefined)
            return txtD(`Stop price is required for ${type} orders.`, {
              error: "missing_stop_price",
            });

          const sym = symbol.toUpperCase();

          // PDT enforcement: block day trades when account is at the limit.
          if (side === "buy") {
            try {
              const acct = await tradingReq<Account>(cfg, "GET", "/v2/account");
              const equity = parseFloat(acct.equity ?? "0");
              const dtCount = acct.daytrade_count ?? 0;
              if (equity < PDT_EQUITY_THRESHOLD && dtCount >= PDT_LIMIT) {
                api.logger.warn(
                  `alpaca: PDT block — ${dtCount} day trades with equity ${$(equity)} (under ${$(PDT_EQUITY_THRESHOLD)})`,
                );
                return txtD(
                  `Order blocked: PDT rule — ${dtCount} day trades used with equity ${$(equity)} (under ${$(PDT_EQUITY_THRESHOLD)}). Another day trade may restrict your account for 90 days.`,
                  { error: "pdt_blocked", daytradeCount: dtCount, equity },
                );
              }
            } catch {
              // If account fetch fails, allow the order to proceed to policy engine.
            }
          }

          // Estimate price for policy evaluation: use limit_price if available, else fetch quote.
          let estimatedPrice = limit_price ?? stop_price ?? 0;
          if (estimatedPrice === 0) {
            try {
              const quoteData = await dataReq<Quote>(
                cfg,
                `/v2/stocks/${encodeURIComponent(sym)}/quotes/latest`,
              );
              estimatedPrice = side === "buy" ? quoteData.quote.ap : quoteData.quote.bp;
            } catch {
              // If quote fetch fails, proceed with 0 — policy engine will still check other limits.
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
            side: side as "buy" | "sell",
            qty,
            priceUsd: estimatedPrice,
            orderType: (type === "market" ? "market" : "limit") as "market" | "limit",
            limitPrice: limit_price,
          });

          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`alpaca: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`alpaca: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Symbol: ${sym} | Side: ${side.toUpperCase()} | Qty: ${qty} | Type: ${type}\n` +
                `Estimated notional: ${$(qty * estimatedPrice)}\n` +
                `Timeout: ${(decision.timeoutMs ?? 0) / 1000}s`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          const body: Record<string, unknown> = {
            symbol: sym,
            qty: String(qty),
            side,
            type,
            time_in_force,
          };
          if (limit_price !== undefined) body.limit_price = String(limit_price);
          if (stop_price !== undefined) body.stop_price = String(stop_price);

          api.logger.info(
            `alpaca: placing ${side} ${type} order: ${qty} shares of ${sym} (tif: ${time_in_force})`,
          );
          try {
            const r = await tradingReq<Order>(cfg, "POST", "/v2/orders", body);

            // Post-trade: update policy state and write audit entry.
            const notionalUsd = qty * estimatedPrice;
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
                symbol: sym,
                side: side as "buy" | "sell",
                qty,
                priceUsd: estimatedPrice,
                orderType: (type === "market" ? "market" : "limit") as "market" | "limit",
                limitPrice: limit_price,
              }),
            });

            const text = [
              `Order placed successfully.`,
              `Order ID: ${r.id} | Symbol: ${r.symbol}`,
              `Side: ${r.side.toUpperCase()} | Qty: ${r.qty} | Type: ${r.type}`,
              `TIF: ${r.time_in_force} | Status: ${r.status}`,
              r.limit_price ? `Limit Price: ${$(r.limit_price)}` : null,
              `Submitted: ${r.submitted_at}`,
            ]
              .filter(Boolean)
              .join("\n");
            return txtD(text, {
              orderId: r.id,
              symbol: r.symbol,
              side: r.side,
              qty: r.qty,
              type: r.type,
              status: r.status,
            });
          } catch (err) {
            api.logger.warn(`alpaca: order failed: ${errMsg(err)}`);
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
      { name: "alpaca_place_order" },
    );

    // -- Tool 4: alpaca_cancel_order (POLICY-GATED) --------------------------
    api.registerTool(
      {
        name: "alpaca_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on Alpaca. POLICY-GATED: kill switch and audit trail checked before execution.",
        parameters: {
          type: "object",
          properties: { orderId: { type: "string", description: "The order ID to cancel" } },
          required: ["orderId"],
        },
        async execute(_id: string, params: unknown) {
          const { orderId } = params as { orderId: string };
          api.logger.info(`alpaca: cancelling order ${orderId}`);

          // Kill switch gate: hard mode blocks cancels, soft mode allows them.
          const killStatus = await checkKillSwitch();
          if (killStatus.active && !isOrderAllowedUnderKillSwitch(killStatus, "cancel")) {
            const reason = `kill switch active (${killStatus.mode ?? "hard"} mode): ${killStatus.reason ?? "no reason provided"}`;
            api.logger.warn(`alpaca: cancel denied — ${reason}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "denied",
              actor: "system",
              error: reason,
            });
            return txtD(`Cancel denied: ${reason}`, { error: "kill_switch", reason });
          }

          try {
            await tradingReq(cfg, "DELETE", `/v2/orders/${encodeURIComponent(orderId)}`);
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
            api.logger.warn(`alpaca: cancel failed for ${orderId}: ${errMsg(err)}`);
            return txtD(`Cancel failed: ${errMsg(err)}`, { orderId, error: errMsg(err) });
          }
        },
      },
      { name: "alpaca_cancel_order" },
    );

    // -- Tool 5: alpaca_get_positions ----------------------------------------
    api.registerTool(
      {
        name: "alpaca_get_positions",
        label: "Get Positions",
        description: "Get all current open positions on Alpaca, including unrealized P&L.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const pos = await tradingReq<Position[]>(cfg, "GET", "/v2/positions");
            if (!pos?.length) return txtD("No open positions.", { count: 0 });
            const lines = pos.map(
              (p, i) =>
                `${i + 1}. ${p.symbol} (${p.side})\n   ${parseFloat(p.qty)} shares @ avg ${$(p.avg_entry_price)} | cur ${$(p.current_price)}\n   Mkt Value: ${$(p.market_value)} | P&L: ${$(p.unrealized_pl)} (${pct(p.unrealized_plpc)})`,
            );
            return txtD(`Open positions (${pos.length}):\n\n${lines.join("\n\n")}`, {
              count: pos.length,
              positions: pos.map((p) => ({
                symbol: p.symbol,
                qty: p.qty,
                side: p.side,
                unrealized_pl: p.unrealized_pl,
                market_value: p.market_value,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "alpaca_get_positions" },
    );

    // -- Tool 6: alpaca_get_account ------------------------------------------
    api.registerTool(
      {
        name: "alpaca_get_account",
        label: "Get Account",
        description:
          "Get Alpaca account information including buying power, equity, portfolio value, and PDT status.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const a = await tradingReq<Account>(cfg, "GET", "/v2/account");
            const text = [
              `Account: ${a.account_number} (${a.status})`,
              `Equity: ${$(a.equity)} | Last Equity: ${$(a.last_equity)}`,
              `Portfolio Value: ${$(a.portfolio_value)}`,
              `Cash: ${$(a.cash)} | Buying Power: ${$(a.buying_power)}`,
              `Long MV: ${$(a.long_market_value)} | Short MV: ${$(a.short_market_value)}`,
              `Day Trading BP: ${$(a.daytrading_buying_power)}`,
              `PDT Flag: ${a.pattern_day_trader ? "YES" : "no"} | Day Trades (5 days): ${a.daytrade_count}`,
            ].join("\n");
            return txtD(text, {
              accountNumber: a.account_number,
              status: a.status,
              equity: a.equity,
              buyingPower: a.buying_power,
              cash: a.cash,
              portfolioValue: a.portfolio_value,
              patternDayTrader: a.pattern_day_trader,
              daytradeCount: a.daytrade_count,
            });
          } catch (err) {
            return txtD(`Failed to fetch account: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "alpaca_get_account" },
    );

    // -- Tool 7: alpaca_get_order_history ------------------------------------
    api.registerTool(
      {
        name: "alpaca_get_order_history",
        label: "Order History",
        description:
          "Get order history from Alpaca, including filled, cancelled, and pending orders (last 50).",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const orders = await tradingReq<Order[]>(cfg, "GET", "/v2/orders?status=all&limit=50");
            if (!orders?.length) return txtD("No orders in history.", { count: 0 });
            const lines = orders.map((o, i) => {
              const price = o.filled_avg_price
                ? $(o.filled_avg_price)
                : o.limit_price
                  ? $(o.limit_price)
                  : "MKT";
              return `${i + 1}. ${o.symbol} | ${o.side.toUpperCase()} ${o.type.toUpperCase()}\n   Qty: ${parseFloat(o.qty)} (filled: ${parseFloat(o.filled_qty)}) | Price: ${price}\n   Status: ${o.status} | ID: ${o.id} | Created: ${o.created_at}`;
            });
            return txtD(`Order history (${orders.length}):\n\n${lines.join("\n\n")}`, {
              count: orders.length,
              orders: orders.map((o) => ({
                id: o.id,
                symbol: o.symbol,
                side: o.side,
                type: o.type,
                qty: o.qty,
                status: o.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch order history: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "alpaca_get_order_history" },
    );

    // -- Tool 8: alpaca_place_bracket_order (POLICY-GATED) ------------------
    api.registerTool(
      {
        name: "alpaca_place_bracket_order",
        label: "Place Bracket Order",
        description:
          "Place a bracket order on Alpaca: a primary buy/sell with attached stop-loss and take-profit legs. " +
          "POLICY-GATED: TradingPolicyEngine evaluates the primary order before execution.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)" },
            qty: { type: "number", description: "Number of shares to trade" },
            side: { type: "string", enum: ["buy", "sell"], description: "Order side" },
            type: {
              type: "string",
              enum: ["market", "limit"],
              description: "Primary order type (default: market)",
            },
            limit_price: {
              type: "number",
              description: "Limit price for the primary order (required if type is limit)",
            },
            time_in_force: {
              type: "string",
              enum: ["day", "gtc"],
              description: "Time in force (default: day)",
            },
            stop_loss_price: { type: "number", description: "Stop-loss trigger price" },
            take_profit_price: { type: "number", description: "Take-profit limit price" },
          },
          required: ["symbol", "qty", "side", "stop_loss_price", "take_profit_price"],
        },
        async execute(_id: string, params: unknown) {
          const {
            symbol,
            qty,
            side,
            type = "market",
            limit_price,
            time_in_force = "day",
            stop_loss_price,
            take_profit_price,
          } = params as {
            symbol: string;
            qty: number;
            side: "buy" | "sell";
            type?: string;
            limit_price?: number;
            time_in_force?: string;
            stop_loss_price: number;
            take_profit_price: number;
          };
          if (qty <= 0) return txtD("Quantity must be greater than 0.", { error: "invalid_qty" });
          if (type === "limit" && limit_price === undefined)
            return txtD("Limit price is required for limit orders.", {
              error: "missing_limit_price",
            });
          if (side === "buy" && stop_loss_price >= take_profit_price) {
            return txtD("For buy orders, stop_loss_price must be below take_profit_price.", {
              error: "invalid_bracket",
            });
          }
          if (side === "sell" && stop_loss_price <= take_profit_price) {
            return txtD("For sell orders, stop_loss_price must be above take_profit_price.", {
              error: "invalid_bracket",
            });
          }

          const sym = symbol.toUpperCase();
          const estimatedPrice = limit_price ?? stop_loss_price;

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
            side: side as "buy" | "sell",
            qty,
            priceUsd: estimatedPrice,
            orderType: (type === "market" ? "market" : "limit") as "market" | "limit",
            limitPrice: limit_price,
          });
          const decision = await policyEngine.evaluateOrder(order);
          if (decision.outcome === "denied") {
            return txtD(`Bracket order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }
          if (decision.outcome === "pending_confirmation") {
            return txtD(
              `Bracket order requires ${decision.approvalMode} approval.\nSymbol: ${sym} | ${side.toUpperCase()} ${qty} shares\nStop Loss: ${$(stop_loss_price)} | Take Profit: ${$(take_profit_price)}`,
              { status: "pending_confirmation", approvalMode: decision.approvalMode },
            );
          }

          // Alpaca bracket order: OTO (one-triggers-other) with stop_loss + take_profit
          const body: Record<string, unknown> = {
            symbol: sym,
            qty: String(qty),
            side,
            type,
            time_in_force,
            order_class: "bracket",
            stop_loss: { stop_price: String(stop_loss_price) },
            take_profit: { limit_price: String(take_profit_price) },
          };
          if (limit_price !== undefined) body.limit_price = String(limit_price);

          api.logger.info(
            `alpaca: placing bracket order: ${side} ${qty} ${sym} | SL: ${$(stop_loss_price)} | TP: ${$(take_profit_price)}`,
          );
          try {
            const r = await tradingReq<Order>(cfg, "POST", "/v2/orders", body);
            const notionalUsd = qty * estimatedPrice;
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
                symbol: sym,
                side: side as "buy" | "sell",
                qty,
                priceUsd: estimatedPrice,
                orderType: "market",
              }),
            });

            const text = [
              `Bracket order placed.`,
              `Order ID: ${r.id} | Symbol: ${r.symbol} | ${r.side.toUpperCase()} ${r.qty} shares`,
              `Stop Loss: ${$(stop_loss_price)} | Take Profit: ${$(take_profit_price)}`,
              `Type: ${r.type} | TIF: ${r.time_in_force} | Status: ${r.status}`,
            ].join("\n");
            return txtD(text, {
              orderId: r.id,
              symbol: r.symbol,
              side: r.side,
              qty: r.qty,
              stopLoss: stop_loss_price,
              takeProfit: take_profit_price,
              status: r.status,
            });
          } catch (err) {
            api.logger.warn(`alpaca: bracket order failed: ${errMsg(err)}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "rejected",
              actor: "system",
              error: errMsg(err),
            });
            return txtD(`Bracket order failed: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "alpaca_place_bracket_order" },
    );

    // -- Service: alpaca-sync (periodic position sync + PDT warning) ---------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "alpaca-sync",
      start: () => {
        const syncMs = cfg.syncIntervalMs ?? SYNC_INTERVAL_MS;
        api.logger.info(`alpaca-sync: starting position sync (every ${syncMs / 1000}s)`);
        const sync = async () => {
          try {
            const [positions, account] = await Promise.all([
              tradingReq<Position[]>(cfg, "GET", "/v2/positions"),
              tradingReq<Account>(cfg, "GET", "/v2/account"),
            ]);
            const count = positions?.length ?? 0;
            const totalPnl = (positions ?? []).reduce(
              (s, p) => s + parseFloat(p.unrealized_pl ?? "0"),
              0,
            );
            const equity = parseFloat(account.equity ?? "0");
            api.logger.info(
              `alpaca-sync: ${count} position(s), unrealized P&L: ${$(totalPnl)}, equity: ${$(equity)}`,
            );

            // Persist position data to policy state for cross-extension risk checks.
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};
            for (const p of positions ?? []) {
              const mv = parseFloat(p.market_value ?? "0");
              positionsByAsset[p.symbol] = {
                extensionId: EXTENSION_ID,
                valueUsd: mv,
                percentOfPortfolio: equity > 0 ? (mv / equity) * 100 : 0,
              };
            }

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              ...withPlatformPositionCount(state, EXTENSION_ID, count),
              ...withPlatformPortfolio(state, EXTENSION_ID, equity),
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, equity),
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

            // PDT rule warning
            const dtCount = account.daytrade_count ?? 0;
            if (equity < PDT_EQUITY_THRESHOLD && dtCount >= PDT_LIMIT) {
              api.logger.warn(
                `alpaca-sync: PDT WARNING - ${dtCount} day trades with equity ${$(equity)} (under ${$(PDT_EQUITY_THRESHOLD)}). Another day trade may flag account as PDT and restrict trading for 90 days.`,
              );
            } else if (equity < PDT_EQUITY_THRESHOLD && dtCount >= PDT_LIMIT - 1) {
              api.logger.warn(
                `alpaca-sync: PDT CAUTION - ${dtCount} day trades with equity ${$(equity)}. Approaching the 4 day-trade limit.`,
              );
            }
          } catch (err) {
            api.logger.warn(`alpaca-sync: sync failed: ${errMsg(err)}`);
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
        api.logger.info("alpaca-sync: stopped");
      },
    });
  },
};

export default alpacaPlugin;
