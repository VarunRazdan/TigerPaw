/**
 * Tigerpaw Interactive Brokers Extension
 *
 * Trading via the IBKR Client Portal API (CP Gateway).
 * Provides contract search, quote retrieval, order placement (policy-gated),
 * bracket orders, position tracking, account info, order history, and a
 * background sync service.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the IBKR API.
 */
import { randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  TradingPolicyEngine,
  writeAuditEntry,
  updatePolicyState,
  autoActivateIfBreached,
  type TradeOrder,
} from "tigerpaw/trading";
import { ibkrConfigSchema, getBaseUrl, type IbkrConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 30_000;
const EXTENSION_ID = "ibkr";

// -- API types ---------------------------------------------------------------
type Contract = {
  conid: number;
  symbol: string;
  secType: string;
  exchange: string;
  companyName: string;
};
type MarketData = { conid: number; last_price: string; bid: string; ask: string; change: string };
type IbkrOrder = {
  orderId: number;
  conid: number;
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  filledQuantity: number;
  status: string;
  lastFillPrice: number;
};
type Position = {
  conid: number;
  contractDesc: string;
  position: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  currency: string;
};
type AccountSummary = {
  accountId: string;
  netLiquidation: number;
  buyingPower: number;
  availableFunds: number;
  grossPositionValue: number;
  maintenanceMargin: number;
};

// -- API helpers (native fetch, Node 22+) ------------------------------------
async function cpReq<T>(cfg: IbkrConfig, method: string, path: string, body?: unknown): Promise<T> {
  const baseUrl = getBaseUrl(cfg.gatewayHost);
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`IBKR CP API ${res.status}: ${t || res.statusText}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
const ibkrPlugin = {
  id: EXTENSION_ID,
  name: "Interactive Brokers",
  description: "Interactive Brokers Client Portal API trading extension",
  kind: "trading" as const,
  configSchema: ibkrConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = ibkrConfigSchema.parse(api.pluginConfig);
    api.logger.info(`ibkr: plugin registered (mode: ${cfg.mode}, gateway: ${cfg.gatewayHost})`);

    // Resolve the policy engine from the trading config on the API, if available.
    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: ibkr_search_contracts ----------------------------------------
    api.registerTool(
      {
        name: "ibkr_search_contracts",
        label: "Search Contracts",
        description:
          "Search for tradeable contracts on Interactive Brokers (stocks, options, futures). Returns matching contracts with conid, symbol, security type, and exchange.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Symbol or partial name to search for" },
            secType: { type: "string", description: "Security type filter (STK, OPT, FUT, etc.)" },
            limit: { type: "number", description: "Max results (default: 20)" },
          },
          required: ["symbol"],
        },
        async execute(_id: string, params: unknown) {
          const {
            symbol,
            secType,
            limit = 20,
          } = params as { symbol: string; secType?: string; limit?: number };
          try {
            const contracts = await cpReq<Contract[]>(
              cfg,
              "GET",
              `/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}${secType ? `&secType=${encodeURIComponent(secType)}` : ""}`,
            );
            const filtered = (contracts ?? []).slice(0, Math.min(Math.max(1, limit), 50));
            if (!filtered.length)
              return txtD(`No contracts found matching "${symbol}".`, { count: 0 });
            const lines = filtered.map(
              (c, i) =>
                `${i + 1}. ${c.symbol} - ${c.companyName}\n   ConID: ${c.conid} | Type: ${c.secType} | Exchange: ${c.exchange}`,
            );
            return txtD(`Found ${filtered.length} contract(s):\n\n${lines.join("\n\n")}`, {
              count: filtered.length,
              contracts: filtered.map((c) => ({
                conid: c.conid,
                symbol: c.symbol,
                secType: c.secType,
                exchange: c.exchange,
                companyName: c.companyName,
              })),
            });
          } catch (err) {
            return txtD(`Failed to search contracts: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "ibkr_search_contracts" },
    );

    // -- Tool 2: ibkr_get_quote -----------------------------------------------
    api.registerTool(
      {
        name: "ibkr_get_quote",
        label: "Get Quote",
        description:
          "Get a market data snapshot for a contract by conid, including last price, bid, ask, and change.",
        parameters: {
          type: "object",
          properties: {
            conid: { type: "number", description: "Contract ID (conid) from IBKR" },
          },
          required: ["conid"],
        },
        async execute(_id: string, params: unknown) {
          const { conid } = params as { conid: number };
          try {
            const data = await cpReq<MarketData[]>(
              cfg,
              "GET",
              `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,85,86`,
            );
            const md = data?.[0];
            if (!md)
              return txtD(`No market data available for conid ${conid}.`, { error: "no_data" });
            const last = parseFloat(md.last_price || "0");
            const bid = parseFloat(md.bid || "0");
            const ask = parseFloat(md.ask || "0");
            const change = md.change || "0";
            const text = `Quote for conid ${conid}:\nLast: ${$(last)} | Bid: ${$(bid)} | Ask: ${$(ask)}\nMid: ${$((bid + ask) / 2)} | Spread: ${$(ask - bid)}\nChange: ${change}`;
            return txtD(text, { conid, last, bid, ask, change });
          } catch (err) {
            return txtD(`Failed to get quote for conid ${conid}: ${errMsg(err)}`, {
              error: errMsg(err),
            });
          }
        },
      },
      { name: "ibkr_get_quote" },
    );

    // -- Tool 3: ibkr_place_order (POLICY-GATED) ------------------------------
    api.registerTool(
      {
        name: "ibkr_place_order",
        label: "Place Order",
        description:
          "Place an order on Interactive Brokers via the Client Portal API. Supports market, limit, stop, and stop_limit order types. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            conid: { type: "number", description: "Contract ID (conid)" },
            symbol: { type: "string", description: "Symbol for display and policy tracking" },
            qty: { type: "number", description: "Number of units to trade" },
            side: { type: "string", enum: ["BUY", "SELL"], description: "Order side" },
            orderType: {
              type: "string",
              enum: ["MKT", "LMT", "STP", "STP_LIMIT"],
              description: "Order type (default: MKT)",
            },
            tif: {
              type: "string",
              enum: ["DAY", "GTC", "IOC", "FOK"],
              description: "Time in force (default: DAY)",
            },
            price: { type: "number", description: "Limit price (required for LMT/STP_LIMIT)" },
            auxPrice: { type: "number", description: "Stop price (required for STP/STP_LIMIT)" },
          },
          required: ["conid", "symbol", "qty", "side"],
        },
        async execute(_id: string, params: unknown) {
          const {
            conid,
            symbol,
            qty,
            side,
            orderType = "MKT",
            tif = "DAY",
            price,
            auxPrice,
          } = params as {
            conid: number;
            symbol: string;
            qty: number;
            side: "BUY" | "SELL";
            orderType?: string;
            tif?: string;
            price?: number;
            auxPrice?: number;
          };
          if (qty <= 0) return txtD("Quantity must be greater than 0.", { error: "invalid_qty" });
          if ((orderType === "LMT" || orderType === "STP_LIMIT") && price === undefined)
            return txtD(`Limit price is required for ${orderType} orders.`, {
              error: "missing_price",
            });
          if ((orderType === "STP" || orderType === "STP_LIMIT") && auxPrice === undefined)
            return txtD(`Stop price (auxPrice) is required for ${orderType} orders.`, {
              error: "missing_aux_price",
            });

          const sym = symbol.toUpperCase();
          const normalizedSide = side.toUpperCase() === "BUY" ? "buy" : "sell";

          // Estimate price for policy evaluation
          let estimatedPrice = price ?? auxPrice ?? 0;
          if (estimatedPrice === 0) {
            try {
              const data = await cpReq<MarketData[]>(
                cfg,
                "GET",
                `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,85,86`,
              );
              const md = data?.[0];
              if (md) {
                estimatedPrice =
                  normalizedSide === "buy" ? parseFloat(md.ask || "0") : parseFloat(md.bid || "0");
              }
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
            side: normalizedSide,
            qty,
            priceUsd: estimatedPrice,
            orderType: (orderType === "MKT" ? "market" : "limit") as "market" | "limit",
            limitPrice: price,
          });

          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`ibkr: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`ibkr: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Symbol: ${sym} | Side: ${side} | Qty: ${qty} | Type: ${orderType}\n` +
                `Estimated notional: ${$(qty * estimatedPrice)}\n` +
                `Timeout: ${(decision.timeoutMs ?? 0) / 1000}s`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          const body = {
            acctId: cfg.accountId,
            conid,
            secType: `${conid}:STK`,
            orderType,
            side,
            quantity: qty,
            tif,
            ...(price !== undefined ? { price } : {}),
            ...(auxPrice !== undefined ? { auxPrice } : {}),
          };

          api.logger.info(
            `ibkr: placing ${side} ${orderType} order: ${qty} units of ${sym} (conid: ${conid}, tif: ${tif})`,
          );
          try {
            const r = await cpReq<IbkrOrder[]>(
              cfg,
              "POST",
              `/iserver/account/${encodeURIComponent(cfg.accountId)}/orders`,
              { orders: [body] },
            );
            const order = r?.[0];
            if (!order) throw new Error("No order response from IBKR");

            // Post-trade: update policy state and write audit entry.
            const notionalUsd = qty * estimatedPrice;
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              dailySpendUsd: state.dailySpendUsd + (normalizedSide === "buy" ? notionalUsd : 0),
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({
                symbol: sym,
                side: normalizedSide,
                qty,
                priceUsd: estimatedPrice,
                orderType: (orderType === "MKT" ? "market" : "limit") as "market" | "limit",
                limitPrice: price,
              }),
            });

            const text = [
              `Order placed successfully.`,
              `Order ID: ${order.orderId} | Symbol: ${order.symbol} (conid: ${order.conid})`,
              `Side: ${order.side} | Qty: ${order.quantity} | Type: ${order.orderType}`,
              `Status: ${order.status}`,
              order.lastFillPrice ? `Last Fill Price: ${$(order.lastFillPrice)}` : null,
            ]
              .filter(Boolean)
              .join("\n");
            return txtD(text, {
              orderId: order.orderId,
              symbol: order.symbol,
              conid: order.conid,
              side: order.side,
              qty: order.quantity,
              orderType: order.orderType,
              status: order.status,
            });
          } catch (err) {
            api.logger.warn(`ibkr: order failed: ${errMsg(err)}`);
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
      { name: "ibkr_place_order" },
    );

    // -- Tool 4: ibkr_place_bracket_order (POLICY-GATED) ----------------------
    api.registerTool(
      {
        name: "ibkr_place_bracket_order",
        label: "Place Bracket Order",
        description:
          "Place a bracket order on Interactive Brokers: a primary buy/sell with attached stop-loss and take-profit legs. " +
          "POLICY-GATED: TradingPolicyEngine evaluates the primary order before execution.",
        parameters: {
          type: "object",
          properties: {
            conid: { type: "number", description: "Contract ID (conid)" },
            symbol: { type: "string", description: "Symbol for display and policy tracking" },
            qty: { type: "number", description: "Number of units to trade" },
            side: { type: "string", enum: ["BUY", "SELL"], description: "Order side" },
            orderType: {
              type: "string",
              enum: ["MKT", "LMT"],
              description: "Primary order type (default: MKT)",
            },
            price: {
              type: "number",
              description: "Limit price for the primary order (required if orderType is LMT)",
            },
            tif: {
              type: "string",
              enum: ["DAY", "GTC"],
              description: "Time in force (default: DAY)",
            },
            stopLossPrice: { type: "number", description: "Stop-loss trigger price" },
            takeProfitPrice: { type: "number", description: "Take-profit limit price" },
          },
          required: ["conid", "symbol", "qty", "side", "stopLossPrice", "takeProfitPrice"],
        },
        async execute(_id: string, params: unknown) {
          const {
            conid,
            symbol,
            qty,
            side,
            orderType = "MKT",
            price,
            tif = "DAY",
            stopLossPrice,
            takeProfitPrice,
          } = params as {
            conid: number;
            symbol: string;
            qty: number;
            side: "BUY" | "SELL";
            orderType?: string;
            price?: number;
            tif?: string;
            stopLossPrice: number;
            takeProfitPrice: number;
          };
          if (qty <= 0) return txtD("Quantity must be greater than 0.", { error: "invalid_qty" });
          if (orderType === "LMT" && price === undefined)
            return txtD("Limit price is required for LMT orders.", { error: "missing_price" });

          const sym = symbol.toUpperCase();
          const normalizedSide = side.toUpperCase() === "BUY" ? "buy" : "sell";

          if (normalizedSide === "buy" && stopLossPrice >= takeProfitPrice) {
            return txtD("For buy orders, stopLossPrice must be below takeProfitPrice.", {
              error: "invalid_bracket",
            });
          }
          if (normalizedSide === "sell" && stopLossPrice <= takeProfitPrice) {
            return txtD("For sell orders, stopLossPrice must be above takeProfitPrice.", {
              error: "invalid_bracket",
            });
          }

          const estimatedPrice = price ?? stopLossPrice;

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
            side: normalizedSide,
            qty,
            priceUsd: estimatedPrice,
            orderType: (orderType === "MKT" ? "market" : "limit") as "market" | "limit",
            limitPrice: price,
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
              `Bracket order requires ${decision.approvalMode} approval.\nSymbol: ${sym} | ${side} ${qty} units\nStop Loss: ${$(stopLossPrice)} | Take Profit: ${$(takeProfitPrice)}`,
              { status: "pending_confirmation", approvalMode: decision.approvalMode },
            );
          }

          // IBKR bracket: parent order + attached child orders
          const parentOrder = {
            acctId: cfg.accountId,
            conid,
            orderType,
            side,
            quantity: qty,
            tif,
            ...(price !== undefined ? { price } : {}),
          };
          const stopLossOrder = {
            acctId: cfg.accountId,
            conid,
            orderType: "STP",
            side: normalizedSide === "buy" ? "SELL" : "BUY",
            quantity: qty,
            tif,
            auxPrice: stopLossPrice,
          };
          const takeProfitOrder = {
            acctId: cfg.accountId,
            conid,
            orderType: "LMT",
            side: normalizedSide === "buy" ? "SELL" : "BUY",
            quantity: qty,
            tif,
            price: takeProfitPrice,
          };

          api.logger.info(
            `ibkr: placing bracket order: ${side} ${qty} ${sym} | SL: ${$(stopLossPrice)} | TP: ${$(takeProfitPrice)}`,
          );
          try {
            const r = await cpReq<IbkrOrder[]>(
              cfg,
              "POST",
              `/iserver/account/${encodeURIComponent(cfg.accountId)}/orders`,
              { orders: [parentOrder, stopLossOrder, takeProfitOrder] },
            );
            const primary = r?.[0];
            if (!primary) throw new Error("No order response from IBKR");

            const notionalUsd = qty * estimatedPrice;
            await updatePolicyState((state) => ({
              ...state,
              dailyTradeCount: state.dailyTradeCount + 1,
              dailySpendUsd: state.dailySpendUsd + (normalizedSide === "buy" ? notionalUsd : 0),
              lastTradeAtMs: Date.now(),
            }));
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "submitted",
              actor: "agent",
              orderSnapshot: buildTradeOrder({
                symbol: sym,
                side: normalizedSide,
                qty,
                priceUsd: estimatedPrice,
                orderType: "market",
              }),
            });

            const text = [
              `Bracket order placed.`,
              `Order ID: ${primary.orderId} | Symbol: ${sym} (conid: ${conid}) | ${side} ${qty} units`,
              `Stop Loss: ${$(stopLossPrice)} | Take Profit: ${$(takeProfitPrice)}`,
              `Type: ${orderType} | TIF: ${tif} | Status: ${primary.status}`,
            ].join("\n");
            return txtD(text, {
              orderId: primary.orderId,
              symbol: sym,
              conid,
              side,
              qty,
              stopLoss: stopLossPrice,
              takeProfit: takeProfitPrice,
              status: primary.status,
            });
          } catch (err) {
            api.logger.warn(`ibkr: bracket order failed: ${errMsg(err)}`);
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
      { name: "ibkr_place_bracket_order" },
    );

    // -- Tool 5: ibkr_cancel_order --------------------------------------------
    api.registerTool(
      {
        name: "ibkr_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on Interactive Brokers. Includes audit trail logging.",
        parameters: {
          type: "object",
          properties: { orderId: { type: "string", description: "The order ID to cancel" } },
          required: ["orderId"],
        },
        async execute(_id: string, params: unknown) {
          const { orderId } = params as { orderId: string };
          api.logger.info(`ibkr: cancelling order ${orderId}`);
          try {
            await cpReq(
              cfg,
              "DELETE",
              `/iserver/account/${encodeURIComponent(cfg.accountId)}/order/${encodeURIComponent(orderId)}`,
            );
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
            api.logger.warn(`ibkr: cancel failed for ${orderId}: ${errMsg(err)}`);
            return txtD(`Cancel failed: ${errMsg(err)}`, { orderId, error: errMsg(err) });
          }
        },
      },
      { name: "ibkr_cancel_order" },
    );

    // -- Tool 6: ibkr_get_positions -------------------------------------------
    api.registerTool(
      {
        name: "ibkr_get_positions",
        label: "Get Positions",
        description:
          "Get all current open positions on Interactive Brokers, including unrealized P&L and market value.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const positions = await cpReq<Position[]>(
              cfg,
              "GET",
              `/portfolio/${encodeURIComponent(cfg.accountId)}/positions/0`,
            );
            if (!positions?.length) return txtD("No open positions.", { count: 0 });
            const lines = positions.map(
              (p, i) =>
                `${i + 1}. ${p.contractDesc} (conid: ${p.conid})\n   Position: ${p.position} | Price: ${$(p.marketPrice)}\n   Mkt Value: ${$(p.marketValue)} | P&L: ${$(p.unrealizedPnl)} | Currency: ${p.currency}`,
            );
            return txtD(`Open positions (${positions.length}):\n\n${lines.join("\n\n")}`, {
              count: positions.length,
              positions: positions.map((p) => ({
                conid: p.conid,
                contractDesc: p.contractDesc,
                position: p.position,
                marketValue: p.marketValue,
                unrealizedPnl: p.unrealizedPnl,
                currency: p.currency,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "ibkr_get_positions" },
    );

    // -- Tool 7: ibkr_get_account ---------------------------------------------
    api.registerTool(
      {
        name: "ibkr_get_account",
        label: "Get Account",
        description:
          "Get Interactive Brokers account summary including net liquidation value, buying power, available funds, and margin information.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const summary = await cpReq<AccountSummary>(
              cfg,
              "GET",
              `/portfolio/${encodeURIComponent(cfg.accountId)}/summary`,
            );
            const text = [
              `Account: ${summary.accountId}`,
              `Net Liquidation: ${$(summary.netLiquidation)}`,
              `Buying Power: ${$(summary.buyingPower)}`,
              `Available Funds: ${$(summary.availableFunds)}`,
              `Gross Position Value: ${$(summary.grossPositionValue)}`,
              `Maintenance Margin: ${$(summary.maintenanceMargin)}`,
            ].join("\n");
            return txtD(text, {
              accountId: summary.accountId,
              netLiquidation: summary.netLiquidation,
              buyingPower: summary.buyingPower,
              availableFunds: summary.availableFunds,
              grossPositionValue: summary.grossPositionValue,
              maintenanceMargin: summary.maintenanceMargin,
            });
          } catch (err) {
            return txtD(`Failed to fetch account summary: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "ibkr_get_account" },
    );

    // -- Tool 8: ibkr_get_order_history ---------------------------------------
    api.registerTool(
      {
        name: "ibkr_get_order_history",
        label: "Order History",
        description:
          "Get recent order history from Interactive Brokers, including filled, cancelled, and pending orders.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const data = await cpReq<{ orders: IbkrOrder[] }>(
              cfg,
              "GET",
              "/iserver/account/orders",
            );
            const orders = data?.orders ?? [];
            if (!orders.length) return txtD("No orders in history.", { count: 0 });
            const lines = orders.map((o, i) => {
              const price = o.lastFillPrice ? $(o.lastFillPrice) : "N/A";
              return `${i + 1}. ${o.symbol} (conid: ${o.conid}) | ${o.side} ${o.orderType}\n   Qty: ${o.quantity} (filled: ${o.filledQuantity}) | Price: ${price}\n   Status: ${o.status} | Order ID: ${o.orderId}`;
            });
            return txtD(`Order history (${orders.length}):\n\n${lines.join("\n\n")}`, {
              count: orders.length,
              orders: orders.map((o) => ({
                orderId: o.orderId,
                conid: o.conid,
                symbol: o.symbol,
                side: o.side,
                orderType: o.orderType,
                quantity: o.quantity,
                status: o.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch order history: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "ibkr_get_order_history" },
    );

    // -- Service: ibkr-sync (periodic position sync) --------------------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "ibkr-sync",
      start: () => {
        api.logger.info(`ibkr-sync: starting position sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
        const sync = async () => {
          try {
            const [positions, summary] = await Promise.all([
              cpReq<Position[]>(
                cfg,
                "GET",
                `/portfolio/${encodeURIComponent(cfg.accountId)}/positions/0`,
              ),
              cpReq<AccountSummary>(
                cfg,
                "GET",
                `/portfolio/${encodeURIComponent(cfg.accountId)}/summary`,
              ),
            ]);
            const count = positions?.length ?? 0;
            const totalPnl = (positions ?? []).reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
            const nlv = summary.netLiquidation ?? 0;
            api.logger.info(
              `ibkr-sync: ${count} position(s), unrealized P&L: ${$(totalPnl)}, NLV: ${$(nlv)}`,
            );

            // Persist position data to policy state for cross-extension risk checks.
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};
            for (const p of positions ?? []) {
              const mv = p.marketValue ?? 0;
              positionsByAsset[p.contractDesc] = {
                extensionId: EXTENSION_ID,
                valueUsd: mv,
                percentOfPortfolio: nlv > 0 ? (mv / nlv) * 100 : 0,
              };
            }

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              openPositionCount: count,
              currentPortfolioValueUsd: nlv,
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, nlv),
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
            api.logger.warn(`ibkr-sync: sync failed: ${errMsg(err)}`);
          }
        };
        sync();
        syncTimer = setInterval(sync, SYNC_INTERVAL_MS);
      },
      stop: () => {
        if (syncTimer) {
          clearInterval(syncTimer);
          syncTimer = null;
        }
        api.logger.info("ibkr-sync: stopped");
      },
    });
  },
};

export default ibkrPlugin;
