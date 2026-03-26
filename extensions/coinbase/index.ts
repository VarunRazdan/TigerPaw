/**
 * Tigerpaw Coinbase Extension
 *
 * Crypto spot trading via Coinbase Advanced Trade API.
 * Provides account listing, product info, ticker prices, order placement
 * (policy-gated), order cancellation, position tracking, order history,
 * and a background sync service.
 *
 * All order placement and cancellation tools are gated by the
 * TradingPolicyEngine — every order goes through evaluateOrder() before
 * reaching the Coinbase API.
 */
import { createSign, randomUUID } from "node:crypto";
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
import { coinbaseConfigSchema, getBaseUrl, type CoinbaseConfig } from "./config.js";

// -- Constants ---------------------------------------------------------------
const SYNC_INTERVAL_MS = 60_000;
const EXTENSION_ID = "coinbase";

// -- API response types (Coinbase Advanced Trade) ----------------------------
type CoinbaseAccount = {
  uuid: string;
  name: string;
  currency: string;
  available_balance: { value: string; currency: string };
  hold: { value: string; currency: string };
};

type CoinbaseProduct = {
  product_id: string;
  base_currency_id: string;
  quote_currency_id: string;
  base_min_size: string;
  quote_min_size: string;
  status: string;
};

type CoinbaseOrder = {
  order_id: string;
  product_id: string;
  side: string;
  type: string;
  status: string;
  base_size: string;
  limit_price: string;
  created_time: string;
};

type CoinbaseTicker = {
  trades: Array<{ price: string; size: string; time: string; side: string }>;
  best_bid: string;
  best_ask: string;
};

// -- JWT helpers (Coinbase CDP Key auth, ES256) ------------------------------

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildJwt(cfg: CoinbaseConfig, method: string, path: string): string {
  const now = Math.floor(Date.now() / 1000);
  const uri = `${method} ${new URL(path, getBaseUrl(cfg.mode)).host}${path}`;

  const header = { alg: "ES256", kid: cfg.apiKey, nonce: randomUUID(), typ: "JWT" };
  const payload = {
    sub: cfg.apiKey,
    iss: "coinbase-cloud",
    nbf: now,
    exp: now + 120,
    aud: ["cdp_service"],
    uri,
  };

  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];
  const signingInput = segments.join(".");

  // The apiSecret is an EC P-256 private key in PEM format.
  // Node.js crypto.createSign handles PEM keys natively.
  const signer = createSign("SHA256");
  signer.update(signingInput);
  const signature = signer.sign({ key: cfg.apiSecret, dsaEncoding: "ieee-p1363" });

  return `${signingInput}.${base64url(signature)}`;
}

// -- API helpers (native fetch, Node 22+) ------------------------------------
function buildHeaders(cfg: CoinbaseConfig, method: string, path: string) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${buildJwt(cfg, method, path)}`,
  };
}

async function apiReq<T>(
  cfg: CoinbaseConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${getBaseUrl(cfg.mode)}${path}`, {
    method,
    headers: buildHeaders(cfg, method, path),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Coinbase API ${res.status}: ${t || res.statusText}`);
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
const coinbasePlugin = {
  id: EXTENSION_ID,
  name: "Coinbase",
  description: "Coinbase Advanced Trade crypto trading extension",
  kind: "trading" as const,
  configSchema: coinbaseConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = coinbaseConfigSchema.parse(api.pluginConfig);
    api.logger.info(`coinbase: plugin registered (mode: ${cfg.mode})`);

    // Resolve the policy engine from the trading config on the API, if available.
    let policyEngine: TradingPolicyEngine | null = null;
    if (api.tradingPolicyConfig) {
      policyEngine = new TradingPolicyEngine(api.tradingPolicyConfig);
    }

    // -- Tool 1: coinbase_list_accounts --------------------------------------
    api.registerTool(
      {
        name: "coinbase_list_accounts",
        label: "List Accounts",
        description:
          "List crypto wallets/balances on Coinbase. Shows available balance and holds for each currency.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Max number of accounts to return (default: 50)",
            },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const { limit = 50 } = params as { limit?: number };
          try {
            const data = await apiReq<{ accounts: CoinbaseAccount[] }>(
              cfg,
              "GET",
              `/api/v3/brokerage/accounts?limit=${Math.min(Math.max(1, limit), 250)}`,
            );
            const accounts = data.accounts ?? [];
            if (!accounts.length) return txtD("No accounts found.", { count: 0 });
            const lines = accounts.map((a, i) => {
              const avail = parseFloat(a.available_balance.value);
              const held = parseFloat(a.hold.value);
              return `${i + 1}. ${a.name} (${a.currency})\n   Available: ${avail} ${a.currency} | Hold: ${held} ${a.currency}\n   UUID: ${a.uuid}`;
            });
            return txtD(`Accounts (${accounts.length}):\n\n${lines.join("\n\n")}`, {
              count: accounts.length,
              accounts: accounts.map((a) => ({
                uuid: a.uuid,
                currency: a.currency,
                available: a.available_balance.value,
                hold: a.hold.value,
              })),
            });
          } catch (err) {
            return txtD(`Failed to list accounts: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "coinbase_list_accounts" },
    );

    // -- Tool 2: coinbase_get_product ----------------------------------------
    api.registerTool(
      {
        name: "coinbase_get_product",
        label: "Get Product",
        description:
          "Get trading pair info for a Coinbase product (e.g. BTC-USD). Returns base/quote currencies, min sizes, and status.",
        parameters: {
          type: "object",
          properties: {
            product_id: { type: "string", description: "Trading pair ID (e.g. BTC-USD, ETH-USD)" },
          },
          required: ["product_id"],
        },
        async execute(_id: string, params: unknown) {
          const { product_id } = params as { product_id: string };
          const pid = product_id.toUpperCase();
          try {
            const product = await apiReq<CoinbaseProduct>(
              cfg,
              "GET",
              `/api/v3/brokerage/products/${encodeURIComponent(pid)}`,
            );
            const text = [
              `Product: ${product.product_id}`,
              `Base: ${product.base_currency_id} | Quote: ${product.quote_currency_id}`,
              `Base Min Size: ${product.base_min_size} | Quote Min Size: ${product.quote_min_size}`,
              `Status: ${product.status}`,
            ].join("\n");
            return txtD(text, {
              productId: product.product_id,
              baseCurrency: product.base_currency_id,
              quoteCurrency: product.quote_currency_id,
              baseMinSize: product.base_min_size,
              quoteMinSize: product.quote_min_size,
              status: product.status,
            });
          } catch (err) {
            return txtD(`Failed to get product ${pid}: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "coinbase_get_product" },
    );

    // -- Tool 3: coinbase_get_ticker -----------------------------------------
    api.registerTool(
      {
        name: "coinbase_get_ticker",
        label: "Get Ticker",
        description:
          "Get the latest price for a Coinbase product, including best bid/ask and recent trade.",
        parameters: {
          type: "object",
          properties: {
            product_id: { type: "string", description: "Trading pair ID (e.g. BTC-USD, ETH-USD)" },
          },
          required: ["product_id"],
        },
        async execute(_id: string, params: unknown) {
          const { product_id } = params as { product_id: string };
          const pid = product_id.toUpperCase();
          try {
            const data = await apiReq<CoinbaseTicker>(
              cfg,
              "GET",
              `/api/v3/brokerage/products/${encodeURIComponent(pid)}/ticker?limit=1`,
            );
            const bestBid = parseFloat(data.best_bid || "0");
            const bestAsk = parseFloat(data.best_ask || "0");
            const mid = (bestBid + bestAsk) / 2;
            const spread = bestAsk - bestBid;
            const lastTrade = data.trades?.[0];
            const lines = [
              `Ticker for ${pid}:`,
              `Best Bid: ${$(bestBid)} | Best Ask: ${$(bestAsk)}`,
              `Mid: ${$(mid)} | Spread: ${$(spread)}`,
            ];
            if (lastTrade) {
              lines.push(
                `Last Trade: ${$(lastTrade.price)} x ${lastTrade.size} (${lastTrade.side}) @ ${lastTrade.time}`,
              );
            }
            return txtD(lines.join("\n"), {
              productId: pid,
              bestBid,
              bestAsk,
              mid,
              spread,
              lastTrade: lastTrade
                ? {
                    price: lastTrade.price,
                    size: lastTrade.size,
                    side: lastTrade.side,
                    time: lastTrade.time,
                  }
                : null,
            });
          } catch (err) {
            return txtD(`Failed to get ticker for ${pid}: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "coinbase_get_ticker" },
    );

    // -- Tool 4: coinbase_place_order (POLICY-GATED) -------------------------
    api.registerTool(
      {
        name: "coinbase_place_order",
        label: "Place Order",
        description:
          "Place a crypto order on Coinbase Advanced Trade. Supports market, limit, and stop_limit order types. " +
          "POLICY-GATED: TradingPolicyEngine evaluates kill switch, risk limits, daily spend caps, and approval mode before execution.",
        parameters: {
          type: "object",
          properties: {
            product_id: { type: "string", description: "Trading pair ID (e.g. BTC-USD)" },
            side: { type: "string", enum: ["buy", "sell"], description: "Order side" },
            type: {
              type: "string",
              enum: ["market", "limit", "stop_limit"],
              description: "Order type (default: market)",
            },
            base_size: {
              type: "number",
              description: "Amount of base currency to trade (e.g. 0.001 BTC)",
            },
            limit_price: {
              type: "number",
              description: "Limit price in quote currency (required for limit/stop_limit)",
            },
            stop_price: {
              type: "number",
              description: "Stop trigger price (required for stop_limit)",
            },
          },
          required: ["product_id", "side", "base_size"],
        },
        async execute(_id: string, params: unknown) {
          const {
            product_id,
            side,
            type = "market",
            base_size,
            limit_price,
            stop_price,
          } = params as {
            product_id: string;
            side: "buy" | "sell";
            type?: string;
            base_size: number;
            limit_price?: number;
            stop_price?: number;
          };
          if (base_size <= 0)
            return txtD("Base size must be greater than 0.", { error: "invalid_size" });
          if ((type === "limit" || type === "stop_limit") && limit_price === undefined)
            return txtD(`Limit price is required for ${type} orders.`, {
              error: "missing_limit_price",
            });
          if (type === "stop_limit" && stop_price === undefined)
            return txtD("Stop price is required for stop_limit orders.", {
              error: "missing_stop_price",
            });

          const pid = product_id.toUpperCase();

          // Estimate price for policy evaluation
          let estimatedPrice = limit_price ?? stop_price ?? 0;
          if (estimatedPrice === 0) {
            try {
              const ticker = await apiReq<CoinbaseTicker>(
                cfg,
                "GET",
                `/api/v3/brokerage/products/${encodeURIComponent(pid)}/ticker?limit=1`,
              );
              estimatedPrice =
                side === "buy"
                  ? parseFloat(ticker.best_ask || "0")
                  : parseFloat(ticker.best_bid || "0");
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
            symbol: pid,
            side: side as "buy" | "sell",
            qty: base_size,
            priceUsd: estimatedPrice,
            orderType: (type === "market" ? "market" : "limit") as "market" | "limit",
            limitPrice: limit_price,
          });

          const decision = await policyEngine.evaluateOrder(order);

          if (decision.outcome === "denied") {
            api.logger.warn(`coinbase: order denied by policy engine: ${decision.reason}`);
            return txtD(`Order denied: ${decision.reason}`, {
              error: "policy_denied",
              reason: decision.reason,
              failedStep: decision.failedStep,
            });
          }

          if (decision.outcome === "pending_confirmation") {
            api.logger.info(`coinbase: order pending ${decision.approvalMode} approval`);
            return txtD(
              `Order requires ${decision.approvalMode} approval before execution.\n` +
                `Product: ${pid} | Side: ${side.toUpperCase()} | Size: ${base_size} | Type: ${type}\n` +
                `Estimated notional: ${$(base_size * estimatedPrice)}\n` +
                `Timeout: ${(decision.timeoutMs ?? 0) / 1000}s`,
              {
                status: "pending_confirmation",
                approvalMode: decision.approvalMode,
                timeoutMs: decision.timeoutMs,
              },
            );
          }

          // Build Coinbase order configuration based on type
          const clientOrderId = randomUUID();
          const orderBody: Record<string, unknown> = {
            client_order_id: clientOrderId,
            product_id: pid,
            side: side.toUpperCase(),
          };

          if (type === "market") {
            orderBody.order_configuration = {
              market_market_ioc:
                side === "buy"
                  ? { quote_size: String(base_size * estimatedPrice) }
                  : { base_size: String(base_size) },
            };
          } else if (type === "limit") {
            orderBody.order_configuration = {
              limit_limit_gtc: {
                base_size: String(base_size),
                limit_price: String(limit_price),
              },
            };
          } else if (type === "stop_limit") {
            orderBody.order_configuration = {
              stop_limit_stop_limit_gtc: {
                base_size: String(base_size),
                limit_price: String(limit_price),
                stop_price: String(stop_price),
                stop_direction:
                  side === "buy" ? "STOP_DIRECTION_STOP_UP" : "STOP_DIRECTION_STOP_DOWN",
              },
            };
          }

          api.logger.info(`coinbase: placing ${side} ${type} order: ${base_size} on ${pid}`);
          try {
            const r = await apiReq<{ success: boolean; order_id: string; failure_reason?: string }>(
              cfg,
              "POST",
              "/api/v3/brokerage/orders",
              orderBody,
            );

            if (!r.success) {
              const reason = r.failure_reason ?? "unknown";
              await writeAuditEntry({
                extensionId: EXTENSION_ID,
                action: "rejected",
                actor: "system",
                error: reason,
              });
              return txtD(`Order rejected by Coinbase: ${reason}`, { error: reason });
            }

            // Post-trade: update policy state and write audit entry.
            const notionalUsd = base_size * estimatedPrice;
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
                symbol: pid,
                side: side as "buy" | "sell",
                qty: base_size,
                priceUsd: estimatedPrice,
                orderType: (type === "market" ? "market" : "limit") as "market" | "limit",
                limitPrice: limit_price,
              }),
            });

            const text = [
              `Order placed successfully.`,
              `Order ID: ${r.order_id} | Product: ${pid}`,
              `Side: ${side.toUpperCase()} | Size: ${base_size} | Type: ${type}`,
              limit_price ? `Limit Price: ${$(limit_price)}` : null,
              stop_price ? `Stop Price: ${$(stop_price)}` : null,
              `Estimated Notional: ${$(notionalUsd)}`,
            ]
              .filter(Boolean)
              .join("\n");
            return txtD(text, {
              orderId: r.order_id,
              productId: pid,
              side,
              baseSize: base_size,
              type,
              status: "submitted",
            });
          } catch (err) {
            api.logger.warn(`coinbase: order failed: ${errMsg(err)}`);
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
      { name: "coinbase_place_order" },
    );

    // -- Tool 5: coinbase_cancel_order ---------------------------------------
    api.registerTool(
      {
        name: "coinbase_cancel_order",
        label: "Cancel Order",
        description:
          "Cancel an existing order on Coinbase. POLICY-GATED: kill switch and audit trail checked before execution.",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "string", description: "The order ID to cancel" },
          },
          required: ["order_id"],
        },
        async execute(_id: string, params: unknown) {
          const { order_id } = params as { order_id: string };
          api.logger.info(`coinbase: cancelling order ${order_id}`);

          // Kill switch gate: hard mode blocks cancels, soft mode allows them.
          const killStatus = await checkKillSwitch();
          if (killStatus.active && !isOrderAllowedUnderKillSwitch(killStatus, "cancel")) {
            const reason = `kill switch active (${killStatus.mode ?? "hard"} mode): ${killStatus.reason ?? "no reason provided"}`;
            api.logger.warn(`coinbase: cancel denied — ${reason}`);
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "denied",
              actor: "system",
              error: reason,
            });
            return txtD(`Cancel denied: ${reason}`, { error: "kill_switch", reason });
          }

          try {
            const r = await apiReq<{
              results: Array<{ success: boolean; order_id: string; failure_reason?: string }>;
            }>(cfg, "POST", "/api/v3/brokerage/orders/batch_cancel", { order_ids: [order_id] });
            const result = r.results?.[0];
            if (result && !result.success) {
              return txtD(`Cancel failed: ${result.failure_reason ?? "unknown"}`, {
                orderId: order_id,
                error: result.failure_reason,
              });
            }
            await writeAuditEntry({
              extensionId: EXTENSION_ID,
              action: "cancelled",
              actor: "agent",
            });
            return txtD(`Order ${order_id} cancelled successfully.`, {
              orderId: order_id,
              status: "cancelled",
            });
          } catch (err) {
            api.logger.warn(`coinbase: cancel failed for ${order_id}: ${errMsg(err)}`);
            return txtD(`Cancel failed: ${errMsg(err)}`, { orderId: order_id, error: errMsg(err) });
          }
        },
      },
      { name: "coinbase_cancel_order" },
    );

    // -- Tool 6: coinbase_get_positions --------------------------------------
    api.registerTool(
      {
        name: "coinbase_get_positions",
        label: "Get Positions",
        description:
          "Get current crypto holdings on Coinbase, showing balances across all wallets with non-zero balances.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const data = await apiReq<{ accounts: CoinbaseAccount[] }>(
              cfg,
              "GET",
              "/api/v3/brokerage/accounts?limit=250",
            );
            const accounts = (data.accounts ?? []).filter(
              (a) => parseFloat(a.available_balance.value) > 0 || parseFloat(a.hold.value) > 0,
            );
            if (!accounts.length)
              return txtD("No positions (all balances are zero).", { count: 0 });
            const lines = accounts.map((a, i) => {
              const avail = parseFloat(a.available_balance.value);
              const held = parseFloat(a.hold.value);
              const total = avail + held;
              return `${i + 1}. ${a.currency}\n   Total: ${total} | Available: ${avail} | Hold: ${held}`;
            });
            return txtD(`Positions (${accounts.length}):\n\n${lines.join("\n\n")}`, {
              count: accounts.length,
              positions: accounts.map((a) => ({
                currency: a.currency,
                available: a.available_balance.value,
                hold: a.hold.value,
                total: String(parseFloat(a.available_balance.value) + parseFloat(a.hold.value)),
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch positions: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "coinbase_get_positions" },
    );

    // -- Tool 7: coinbase_get_order_history ----------------------------------
    api.registerTool(
      {
        name: "coinbase_get_order_history",
        label: "Order History",
        description:
          "Get recent order history from Coinbase, including filled, cancelled, and pending orders.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max orders to return (default: 50)" },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const { limit = 50 } = params as { limit?: number };
          try {
            const data = await apiReq<{ orders: CoinbaseOrder[] }>(
              cfg,
              "GET",
              `/api/v3/brokerage/orders/historical/batch?limit=${Math.min(Math.max(1, limit), 100)}`,
            );
            const orders = data.orders ?? [];
            if (!orders.length) return txtD("No orders in history.", { count: 0 });
            const lines = orders.map((o, i) => {
              const price = o.limit_price ? $(o.limit_price) : "MKT";
              return `${i + 1}. ${o.product_id} | ${o.side.toUpperCase()} ${o.type.toUpperCase()}\n   Size: ${o.base_size} | Price: ${price}\n   Status: ${o.status} | ID: ${o.order_id} | Created: ${o.created_time}`;
            });
            return txtD(`Order history (${orders.length}):\n\n${lines.join("\n\n")}`, {
              count: orders.length,
              orders: orders.map((o) => ({
                orderId: o.order_id,
                productId: o.product_id,
                side: o.side,
                type: o.type,
                baseSize: o.base_size,
                status: o.status,
              })),
            });
          } catch (err) {
            return txtD(`Failed to fetch order history: ${errMsg(err)}`, { error: errMsg(err) });
          }
        },
      },
      { name: "coinbase_get_order_history" },
    );

    // -- Service: coinbase-sync (periodic position sync) ---------------------
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "coinbase-sync",
      start: () => {
        const syncMs = cfg.syncIntervalMs ?? SYNC_INTERVAL_MS;
        api.logger.info(`coinbase-sync: starting position sync (every ${syncMs / 1000}s)`);
        const sync = async () => {
          try {
            const data = await apiReq<{ accounts: CoinbaseAccount[] }>(
              cfg,
              "GET",
              "/api/v3/brokerage/accounts?limit=250",
            );
            const accounts = (data.accounts ?? []).filter(
              (a) => parseFloat(a.available_balance.value) > 0 || parseFloat(a.hold.value) > 0,
            );
            const count = accounts.length;

            // Estimate total portfolio value in USD by checking for USD-denominated balances.
            // For a full implementation, each non-USD asset would need a price lookup.
            let totalValueUsd = 0;
            const positionsByAsset: Record<
              string,
              { extensionId: string; valueUsd: number; percentOfPortfolio: number }
            > = {};

            for (const a of accounts) {
              const total = parseFloat(a.available_balance.value) + parseFloat(a.hold.value);
              if (a.currency === "USD" || a.currency === "USDC" || a.currency === "USDT") {
                totalValueUsd += total;
                positionsByAsset[a.currency] = {
                  extensionId: EXTENSION_ID,
                  valueUsd: total,
                  percentOfPortfolio: 0,
                };
              } else {
                // Non-USD assets — value set to 0 until price lookup is implemented.
                positionsByAsset[a.currency] = {
                  extensionId: EXTENSION_ID,
                  valueUsd: 0,
                  percentOfPortfolio: 0,
                };
              }
            }

            // Recalculate percentages now that we have totalValueUsd.
            if (totalValueUsd > 0) {
              for (const key of Object.keys(positionsByAsset)) {
                positionsByAsset[key].percentOfPortfolio =
                  (positionsByAsset[key].valueUsd / totalValueUsd) * 100;
              }
            }

            api.logger.info(
              `coinbase-sync: ${count} position(s), estimated USD value: ${$(totalValueUsd)}`,
            );

            const updatedState = await updatePolicyState((state) => ({
              ...state,
              ...withPlatformPositionCount(state, EXTENSION_ID, count),
              ...withPlatformPortfolio(state, EXTENSION_ID, totalValueUsd),
              highWaterMarkUsd: Math.max(state.highWaterMarkUsd, totalValueUsd),
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
            api.logger.warn(`coinbase-sync: sync failed: ${errMsg(err)}`);
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
        api.logger.info("coinbase-sync: stopped");
      },
    });
  },
};

export default coinbasePlugin;
