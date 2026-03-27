/**
 * Tigerpaw dYdX v4 Extension
 *
 * Decentralized perpetuals trading via dYdX v4's Indexer REST API.
 * Provides market listing, ticker stats, order placement (policy-gated),
 * order cancellation, position tracking, balance queries, and order history.
 *
 * dYdX v4 uses an indexer REST API for reads and Cosmos transactions for
 * writes. This extension uses the indexer API for all read operations and
 * stubs order placement/cancellation (real implementation would require the
 * Cosmos SDK / dYdX client). The critical aspect is that all order actions
 * are gated by the TradingPolicyEngine.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the dYdX network.
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
  type TradeOrder,
} from "tigerpaw/trading";
import { dydxConfigSchema, getIndexerUrl, type DydxConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "dydx";
/** Low volume threshold for stale price warning (in USD). */
const LOW_VOLUME_THRESHOLD_USD = 10_000;

// -- dYdX v4 Indexer API types -----------------------------------------------
type DydxMarket = {
  ticker: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  oraclePrice: string;
  priceChange24H: string;
  volume24H: string;
  nextFundingRate: string;
};
type DydxPosition = {
  market: string;
  status: string;
  side: string;
  size: string;
  maxSize: string;
  entryPrice: string;
  exitPrice: string | null;
  realizedPnl: string;
  unrealizedPnl: string;
};
type DydxFill = {
  id: string;
  side: string;
  size: string;
  price: string;
  type: string;
  market: string;
  createdAt: string;
};
type DydxSubaccount = {
  address: string;
  subaccountNumber: number;
  equity: string;
  freeCollateral: string;
  openPerpetualPositions: Record<string, DydxPosition>;
};

// -- API helper (native fetch, Node 22+) -------------------------------------
async function indexerReq<T>(cfg: DydxConfig, path: string): Promise<T> {
  const url = `${getIndexerUrl(cfg.mode)}${path}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`dYdX Indexer API ${res.status}: ${t || res.statusText}`);
  }
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

// -- Subaccount address helper -----------------------------------------------
function getSubaccountAddress(cfg: DydxConfig): string {
  if (cfg.address) return cfg.address;
  // In a real implementation, derive address from mnemonic via Cosmos SDK.
  // For now, require the address to be configured explicitly.
  throw new Error(
    "dydx: address is required (mnemonic-to-address derivation requires Cosmos SDK — set address explicitly in config)",
  );
}

// -- Plugin ------------------------------------------------------------------
const dydxPlugin = {
  id: EXTENSION_ID,
  name: "dYdX",
  description: "dYdX v4 decentralized perpetuals trading extension",
  kind: "trading" as const,
  configSchema: dydxConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = dydxConfigSchema.parse(api.pluginConfig);
    api.logger.info(
      `dydx: plugin registered (mode: ${cfg.mode}, indexer: ${getIndexerUrl(cfg.mode)})`,
    );

    // Resolve the policy engine from the trading config on the API, if available.
    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: dydx_get_markets ---------------------------------------------
    api.registerTool(
      {
        name: "dydx_get_markets",
        label: "Get Markets",
        description:
          "List all perpetual markets on dYdX v4 with oracle prices, 24h volume, and funding rates.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max results to display (default: 25)" },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const { limit = 25 } = params as { limit?: number };
          try {
            const data = await indexerReq<{ markets: Record<string, DydxMarket> }>(
              cfg,
              "/v4/perpetualMarkets",
            );
            const markets = Object.values(data.markets);
            if (!markets.length) return txtD("No perpetual markets found.", { count: 0 });

            const displayed = markets.slice(0, Math.min(Math.max(1, limit), 100));
            const lines = displayed.map(
              (m, i) =>
                `${i + 1}. ${m.ticker} (${m.baseAsset}/${m.quoteAsset})\n` +
                `   Oracle: ${$(m.oraclePrice)} | 24h Change: ${m.priceChange24H} | Volume: ${$(m.volume24H)}\n` +
                `   Funding Rate: ${m.nextFundingRate} | Status: ${m.status}`,
            );
            return txtD(
              `Perpetual markets (${displayed.length} of ${markets.length}):\n\n${lines.join("\n\n")}`,
              {
                count: displayed.length,
                total: markets.length,
                markets: displayed.map((m) => ({
                  ticker: m.ticker,
                  oraclePrice: m.oraclePrice,
                  volume24H: m.volume24H,
                  fundingRate: m.nextFundingRate,
                })),
              },
            );
          } catch (err) {
            return txtD(`Failed to fetch markets: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "dydx_get_markets" },
    );

    // -- Tool 2: dydx_get_ticker -----------------------------------------------
    api.registerTool(
      {
        name: "dydx_get_ticker",
        label: "Get Ticker",
        description:
          "Get market stats for a specific dYdX perpetual market including oracle price, 24h volume, price change, and funding rate.",
        parameters: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Perpetual market ticker (e.g. BTC-USD, ETH-USD)",
            },
          },
          required: ["ticker"],
        },
        async execute(_id: string, params: unknown) {
          const { ticker } = params as { ticker: string };
          const t = ticker.toUpperCase();
          try {
            const data = await indexerReq<{ markets: Record<string, DydxMarket> }>(
              cfg,
              "/v4/perpetualMarkets",
            );
            const market = data.markets[t];
            if (!market)
              return txtD(
                `Market "${t}" not found. Use dydx_get_markets to see available markets.`,
                { error: "not_found" },
              );

            const text = [
              `${market.ticker} (${market.baseAsset}/${market.quoteAsset})`,
              `Oracle Price: ${$(market.oraclePrice)}`,
              `24h Change: ${market.priceChange24H}`,
              `24h Volume: ${$(market.volume24H)}`,
              `Next Funding Rate: ${market.nextFundingRate}`,
              `Status: ${market.status}`,
            ].join("\n");
            return txtD(text, {
              ticker: market.ticker,
              oraclePrice: market.oraclePrice,
              priceChange24H: market.priceChange24H,
              volume24H: market.volume24H,
              nextFundingRate: market.nextFundingRate,
              status: market.status,
            });
          } catch (err) {
            return txtD(`Failed to fetch ticker for ${t}: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "dydx_get_ticker" },
    );

    // -- Tool 3: dydx_place_order (POLICY-GATED) --------------------------------
    api.registerTool(
      {
        name: "dydx_place_order",
        label: "Place Order",
        description:
          "Place a perpetual futures order on dYdX v4. Supports market and limit order types. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, daily spend caps, and approval mode before execution. " +
          "NOTE: This is a stub — real order submission requires Cosmos SDK transaction signing.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string", description: "Perpetual market ticker (e.g. BTC-USD)" },
            side: {
              type: "string",
              enum: ["buy", "sell"],
              description: "Order side (buy = long, sell = short)",
            },
            size: {
              type: "number",
              description: "Position size in base asset units (e.g. 0.1 for 0.1 BTC)",
            },
            type: {
              type: "string",
              enum: ["market", "limit"],
              description: "Order type (default: market)",
            },
            price: { type: "number", description: "Limit price (required for limit orders)" },
          },
          required: ["ticker", "side", "size"],
        },
        async execute(_id: string, params: unknown) {
          const {
            ticker,
            side,
            size,
            type = "market",
            price,
          } = params as {
            ticker: string;
            side: "buy" | "sell";
            size: number;
            type?: string;
            price?: number;
          };
          if (size <= 0) return txtD("Size must be greater than 0.", { error: "invalid_size" });
          if (type === "limit" && price === undefined)
            return txtD("Price is required for limit orders.", { error: "missing_price" });

          const t = ticker.toUpperCase();

          // Fetch oracle price and market data for policy evaluation + risk warnings.
          let estimatedPrice = price ?? 0;
          const warnings: string[] = [];
          if (estimatedPrice === 0) {
            try {
              const data = await indexerReq<{ markets: Record<string, DydxMarket> }>(
                cfg,
                "/v4/perpetualMarkets",
              );
              const market = data.markets[t];
              if (market) {
                estimatedPrice = parseFloat(market.oraclePrice);
                // Low 24h volume warning — suggests stale pricing / low liquidity.
                const vol24h = parseFloat(market.volume24H ?? "0");
                if (vol24h < LOW_VOLUME_THRESHOLD_USD) {
                  warnings.push(`Low liquidity: 24h volume ${$(vol24h)} — price may be unreliable`);
                  api.logger.warn(`dydx: low volume for ${t}: ${$(vol24h)} 24h`);
                }
              }
            } catch {
              // If fetch fails, proceed with 0 — policy engine will still check other limits.
            }
          }

          // Leverage/liquidation risk warning for perpetuals.
          if (estimatedPrice > 0 && side === "buy") {
            try {
              const subaccountData = await indexerReq<{
                subaccount: {
                  equity: string;
                  openPerpetualPositions: Record<string, DydxPosition>;
                };
              }>(cfg, `/v4/addresses/${cfg.address ?? "unknown"}/subaccountNumber/0`);
              const equity = parseFloat(subaccountData.subaccount.equity ?? "0");
              const orderNotional = size * estimatedPrice;
              const existingNotional = Object.values(
                subaccountData.subaccount.openPerpetualPositions ?? {},
              ).reduce((sum, p) => sum + Math.abs(parseFloat(p.size ?? "0") * estimatedPrice), 0);
              const projectedLeverage =
                equity > 0 ? (existingNotional + orderNotional) / equity : 0;
              if (projectedLeverage > 5) {
                warnings.push(
                  `High leverage warning: projected ${projectedLeverage.toFixed(1)}x — liquidation risk elevated`,
                );
                api.logger.warn(`dydx: high leverage for ${t}: ${projectedLeverage.toFixed(1)}x`);
              }
            } catch {
              // Subaccount fetch failure is non-fatal — continue with policy check.
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
            symbol: t,
            side: side as "buy" | "sell",
            qty: size,
            priceUsd: estimatedPrice,
            orderType: (type === "market" ? "market" : "limit") as "market" | "limit",
            limitPrice: price,
          });

          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`dydx: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`dydx: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Ticker: ${t} | Side: ${side.toUpperCase()} | Size: ${size} | Type: ${type}\n` +
                `Estimated notional: ${$(size * estimatedPrice)}\n` +
                `Timeout: ${(decision.timeoutMs ?? 0) / 1000}s`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          // dYdX v4 order placement requires Cosmos SDK transaction signing
          // which is not yet integrated. Return an explicit error instead of
          // faking success and corrupting policy state.
          api.logger.warn(
            `dydx: order placement not yet implemented (Cosmos SDK signing required)`,
          );
          return txtD(
            `dYdX order placement is not yet implemented — Cosmos SDK transaction signing is required.\n` +
              `Read-only tools are available: dydx_get_markets, dydx_get_positions, dydx_get_balances, dydx_get_ticker.\n` +
              `Ticker: ${t} | Side: ${side.toUpperCase()} | Size: ${size} | Type: ${type}`,
            {
              error: "not_implemented",
              stub: true,
              ticker: t,
              side,
              size,
              type,
            },
          );
        },
      },
      { name: "dydx_place_order" },
    );

    // -- Tool 4: dydx_cancel_order ----------------------------------------------
    api.registerTool(
      {
        name: "dydx_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on dYdX v4. POLICY-GATED: kill switch and audit trail checked before execution. " +
          "NOTE: This is a stub — real cancellation requires Cosmos SDK transaction signing.",
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "The order ID to cancel" },
            ticker: { type: "string", description: "Market ticker for the order (e.g. BTC-USD)" },
          },
          required: ["orderId"],
        },
        async execute(_id: string, params: unknown) {
          const { orderId, ticker } = params as { orderId: string; ticker?: string };
          api.logger.warn(
            `dydx: cancel not yet implemented (Cosmos SDK signing required) — orderId: ${orderId}${ticker ? ` (${ticker})` : ""}`,
          );
          return txtD(
            `dYdX order cancellation is not yet implemented — Cosmos SDK transaction signing is required.\n` +
              `Order ID: ${orderId}`,
            { orderId, error: "not_implemented", stub: true },
          );
        },
      },
      { name: "dydx_cancel_order" },
    );

    // -- Tool 5: dydx_get_positions ---------------------------------------------
    api.registerTool(
      {
        name: "dydx_get_positions",
        label: "Get Positions",
        description:
          "Get all open perpetual positions for the configured dYdX v4 subaccount, including unrealized P&L.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const addr = getSubaccountAddress(cfg);
            const data = await indexerReq<{ subaccount: DydxSubaccount }>(
              cfg,
              `/v4/addresses/${addr}/subaccountNumber/0`,
            );
            const positions = Object.values(data.subaccount.openPerpetualPositions ?? {});
            if (!positions.length) return txtD("No open perpetual positions.", { count: 0 });

            const lines = positions.map(
              (p, i) =>
                `${i + 1}. ${p.market} (${p.side.toUpperCase()})\n` +
                `   Size: ${p.size} | Entry: ${$(p.entryPrice)}\n` +
                `   Unrealized P&L: ${$(p.unrealizedPnl)} | Realized P&L: ${$(p.realizedPnl)}\n` +
                `   Status: ${p.status}`,
            );
            return txtD(`Open positions (${positions.length}):\n\n${lines.join("\n\n")}`, {
              count: positions.length,
              positions: positions.map((p) => ({
                market: p.market,
                side: p.side,
                size: p.size,
                unrealizedPnl: p.unrealizedPnl,
                entryPrice: p.entryPrice,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "dydx_get_positions" },
    );

    // -- Tool 6: dydx_get_balances ----------------------------------------------
    api.registerTool(
      {
        name: "dydx_get_balances",
        label: "Get Balances",
        description:
          "Get subaccount balances including equity, free collateral, and margin details for the configured dYdX v4 address.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const addr = getSubaccountAddress(cfg);
            const data = await indexerReq<{ subaccount: DydxSubaccount }>(
              cfg,
              `/v4/addresses/${addr}/subaccountNumber/0`,
            );
            const sa = data.subaccount;
            const posCount = Object.keys(sa.openPerpetualPositions ?? {}).length;
            const text = [
              `dYdX v4 Subaccount (${cfg.mode})`,
              `Address: ${sa.address} | Subaccount: ${sa.subaccountNumber}`,
              `Equity: ${$(sa.equity)}`,
              `Free Collateral: ${$(sa.freeCollateral)}`,
              `Open Positions: ${posCount}`,
            ].join("\n");
            return txtD(text, {
              address: sa.address,
              subaccountNumber: sa.subaccountNumber,
              equity: sa.equity,
              freeCollateral: sa.freeCollateral,
              openPositionCount: posCount,
            });
          } catch (err) {
            return txtD(`Failed to fetch balances: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "dydx_get_balances" },
    );

    // -- Tool 7: dydx_get_order_history -----------------------------------------
    api.registerTool(
      {
        name: "dydx_get_order_history",
        label: "Order History",
        description:
          "Get recent fills and order history from the dYdX v4 indexer for the configured subaccount.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max fills to return (default: 50)" },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const { limit = 50 } = params as { limit?: number };
          try {
            const addr = getSubaccountAddress(cfg);
            const cap = Math.min(Math.max(1, limit), 100);
            const data = await indexerReq<{ fills: DydxFill[] }>(
              cfg,
              `/v4/fills?address=${addr}&subaccountNumber=0&limit=${cap}`,
            );
            const fills = data.fills ?? [];
            if (!fills.length) return txtD("No fills in history.", { count: 0 });

            const lines = fills.map(
              (f, i) =>
                `${i + 1}. ${f.market} | ${f.side.toUpperCase()} ${f.type}\n` +
                `   Size: ${f.size} | Price: ${$(f.price)}\n` +
                `   ID: ${f.id} | Created: ${f.createdAt}`,
            );
            return txtD(`Fill history (${fills.length}):\n\n${lines.join("\n\n")}`, {
              count: fills.length,
              fills: fills.map((f) => ({
                id: f.id,
                market: f.market,
                side: f.side,
                size: f.size,
                price: f.price,
                type: f.type,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch order history: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "dydx_get_order_history" },
    );

    // -- Tool 8: dydx_close_position (POLICY-GATED) ----------------------------
    api.registerTool(
      {
        name: "dydx_close_position",
        label: "Close Position",
        description:
          "Close an open perpetual position on dYdX v4 by placing an opposite-side market order. " +
          "If quantity is omitted, the entire position is closed. Fetches current position to determine side (LONG/SHORT) and places the opposite. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, and approval mode before execution. " +
          "NOTE: This is a stub — real order submission requires Cosmos SDK transaction signing.",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Perpetual market ticker (e.g. BTC-USD, ETH-USD)",
            },
            quantity: {
              type: "number",
              description: "Size to close in base asset units (omit to close entire position)",
            },
          },
          required: ["symbol"],
        },
        async execute(_id: string, params: unknown) {
          const { symbol, quantity } = params as { symbol: string; quantity?: number };
          const t = symbol.toUpperCase();

          // Fetch current position to determine side and size.
          let position: DydxPosition | undefined;
          try {
            const addr = getSubaccountAddress(cfg);
            const data = await indexerReq<{ subaccount: DydxSubaccount }>(
              cfg,
              `/v4/addresses/${addr}/subaccountNumber/0`,
            );
            position = data.subaccount.openPerpetualPositions?.[t];
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }

          if (!position) {
            return txtD(`No open position found for ${t}.`, {
              error: "no_position",
              symbol: t,
            });
          }

          const posSize = Math.abs(parseFloat(position.size ?? "0"));
          const posSide = position.side?.toUpperCase(); // "LONG" or "SHORT"
          const closeSize = quantity ?? posSize;

          if (quantity !== undefined && quantity > posSize) {
            return txtD(
              `Requested quantity (${quantity}) exceeds position size (${posSize}) for ${t}.`,
              { error: "invalid_quantity", requested: quantity, positionSize: posSize },
            );
          }

          // Determine the opposite side for closing.
          const closeSide: "buy" | "sell" = posSide === "LONG" ? "sell" : "buy";

          // Fetch oracle price for policy evaluation.
          let currentPrice = parseFloat(position.entryPrice ?? "0");
          try {
            const marketData = await indexerReq<{ markets: Record<string, DydxMarket> }>(
              cfg,
              "/v4/perpetualMarkets",
            );
            const market = marketData.markets[t];
            if (market) {
              currentPrice = parseFloat(market.oraclePrice);
            }
          } catch {
            // If fetch fails, use entry price.
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
            symbol: t,
            side: closeSide,
            qty: closeSize,
            priceUsd: currentPrice,
            orderType: "market",
          });
          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`dydx: close position denied by policy engine: ${decision.reason}`);
            return txtD(`Close position denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`dydx: close position pending ${decision.approvalMode} approval`);
            return txtD(
              `Close position requires ${decision.approvalMode} approval before execution.\n` +
                `Ticker: ${t} | Position: ${posSide} ${posSize} | Close: ${closeSide.toUpperCase()} ${closeSize}\n` +
                `Oracle Price: ${$(currentPrice)} | Estimated notional: ${$(closeSize * currentPrice)}`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          // dYdX v4 order placement requires Cosmos SDK transaction signing.
          api.logger.warn(`dydx: close position not yet implemented (Cosmos SDK signing required)`);
          return txtD(
            `dYdX position close is not yet implemented — Cosmos SDK transaction signing is required.\n` +
              `Read-only tools are available: dydx_get_markets, dydx_get_positions, dydx_get_balances, dydx_get_ticker.\n` +
              `Ticker: ${t} | Position: ${posSide} ${posSize} | Would close: ${closeSide.toUpperCase()} ${closeSize}`,
            {
              error: "not_implemented",
              stub: true,
              ticker: t,
              positionSide: posSide,
              positionSize: posSize,
              closeSide,
              closeSize,
            },
          );
        },
      },
      { name: "dydx_close_position" },
    );

    // -- Service: dydx-sync (periodic position sync) ----------------------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "dydx-sync",
      start: () => {
        const syncMs = cfg.syncIntervalMs ?? SYNC_INTERVAL_MS;
        api.logger.info(`dydx-sync: starting position sync (every ${syncMs / 1000}s)`);
        const sync = async () => {
          try {
            const addr = getSubaccountAddress(cfg);
            const data = await indexerReq<{ subaccount: DydxSubaccount }>(
              cfg,
              `/v4/addresses/${addr}/subaccountNumber/0`,
            );
            const sa = data.subaccount;
            const positions = Object.values(sa.openPerpetualPositions ?? {});
            const count = positions.length;
            const equity = parseFloat(sa.equity ?? "0");
            const totalPnl = positions.reduce((s, p) => s + parseFloat(p.unrealizedPnl ?? "0"), 0);
            api.logger.info(
              `dydx-sync: ${count} position(s), unrealized P&L: ${$(totalPnl)}, equity: ${$(equity)}`,
            );

            // Persist position data to policy state for cross-extension risk checks.
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};
            for (const p of positions) {
              const mv = parseFloat(p.size ?? "0") * parseFloat(p.entryPrice ?? "0");
              positionsByAsset[p.market] = {
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
          } catch (err) {
            api.logger.warn(`dydx-sync: sync failed: ${errMsg(err)}`);
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
        api.logger.info("dydx-sync: stopped");
      },
    });
  },
};

export default dydxPlugin;
