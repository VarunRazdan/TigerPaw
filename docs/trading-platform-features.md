# Trading Platform Features & Enhancement Roadmap

A comprehensive analysis of all 9 trading platforms integrated with Tigerpaw: what each platform's API offers, what Tigerpaw currently implements, and what can be added.

---

## Platform Summary

|                                                                            | Platform            | Tools       | Order Types                              | Auth                    | Sync | Status                                      |
| -------------------------------------------------------------------------- | ------------------- | ----------- | ---------------------------------------- | ----------------------- | ---- | ------------------------------------------- |
| <img src="../icons/trading-platforms/alpaca.svg" height="20">              | Alpaca              | 8           | market, limit, stop, stop_limit, bracket | API Key headers         | 30s  | Fully functional                            |
| <img src="../icons/trading-platforms/polymarket.svg" height="20">          | Polymarket          | 6           | limit only                               | HMAC-SHA256             | 60s  | Fully functional                            |
| <img src="../icons/trading-platforms/kalshi.svg" height="20">              | Kalshi              | 6           | market, limit                            | RSA-SHA256              | 60s  | Fully functional                            |
| <img src="../icons/trading-platforms/manifold.svg" height="20">            | Manifold            | 6           | market (implicit)                        | Bearer token            | 60s  | Fully functional (play money)               |
| <img src="../icons/trading-platforms/coinbase.svg" height="20">            | Coinbase            | 7           | market, limit, stop_limit                | ES256 JWT               | 60s  | Fully functional                            |
| <img src="../icons/trading-platforms/interactive-brokers.svg" height="20"> | Interactive Brokers | 8           | MKT, LMT, STP, STP_LIMIT, bracket        | Session (local gateway) | 30s  | Fully functional                            |
| <img src="../icons/trading-platforms/binance.svg" height="20">             | Binance             | 8           | MARKET, LIMIT, STOP_LOSS_LIMIT, OCO      | HMAC-SHA256             | 60s  | Fully functional                            |
| <img src="../icons/trading-platforms/kraken.svg" height="20">              | Kraken              | 7           | market, limit, stop-loss + leverage      | HMAC-SHA512             | 60s  | Fully functional                            |
| <img src="../icons/trading-platforms/dydx.svg" height="20">                | dYdX                | 7 (2 stubs) | market, limit (stubs)                    | Read-only indexer       | 60s  | Read-only (order placement not implemented) |

---

## Per-Platform Analysis

### <img src="../icons/trading-platforms/alpaca.svg" height="28"> Alpaca (Stocks)

**Extension:** `extensions/alpaca/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKeyId` | string | Yes | Alpaca API key ID |
| `apiSecretKey` | string | Yes | Alpaca API secret key |
| `mode` | `"paper"` / `"live"` | No (default: `"paper"`) | Trading mode |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `alpaca_search_assets` -- Search tradeable US equity assets
2. `alpaca_get_quote` -- Get real-time bid/ask prices
3. `alpaca_place_order` (policy-gated) -- Place orders (market/limit/stop/stop_limit)
4. `alpaca_cancel_order` (policy-gated) -- Cancel open orders
5. `alpaca_get_positions` -- Get all open positions
6. `alpaca_get_account` -- Get account info (equity, buying power, PDT status)
7. `alpaca_get_order_history` -- Get last 50 orders
8. `alpaca_place_bracket_order` (policy-gated) -- Place bracket orders with stop-loss and take-profit

**Background Sync:** Every 30s -- syncs positions, equity, P&L, PDT rules. Auto-activates kill switch on limit breach. Warns on PDT near-limit scenarios.

**What Alpaca's API Also Supports (Not Yet in Tigerpaw):**

- Trailing stop orders
- Fractional shares
- Options trading (Alpaca added options in 2024)
- Extended/after-hours trading flag
- Crypto trading (Alpaca supports BTC, ETH, etc.)
- Watchlists
- Account activities/history
- Portfolio history endpoint

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Trailing stop orders | Moderate | Low | Add `trailing_stop` order type, `trail_percent`/`trail_price` params |
| Fractional shares | Low | Low | Already supported by API, just needs tool parameter |
| Extended hours flag | Low | Low | Add `extended_hours: true` parameter to place_order |
| Options trading | High | High | Requires new tools: options chain, options order, Greeks |
| Crypto trading | Moderate | Moderate | Same API, different asset class filter |

---

### <img src="../icons/trading-platforms/polymarket.svg" height="28"> Polymarket (Prediction Markets)

**Extension:** `extensions/polymarket/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKey` | string | Yes | CLOB API key |
| `apiSecret` | string | Yes | CLOB API secret |
| `passphrase` | string | Yes | CLOB passphrase |
| `privateKey` | string | Yes | Ethereum private key for on-chain signing |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `polymarket_search_markets` -- Search prediction markets
2. `polymarket_get_market` -- Get market details (question, outcomes, volume)
3. `polymarket_place_order` (policy-gated) -- Place limit orders (price 0.00-1.00)
4. `polymarket_cancel_order` (policy-gated) -- Cancel open orders
5. `polymarket_get_positions` -- Get open positions
6. `polymarket_get_order_history` -- Get order history

**Background Sync:** Every 60s -- syncs positions and P&L. Tracks portfolio value.

**What Polymarket's API Also Supports (Not Yet in Tigerpaw):**

- Market orders (GTC)
- Conditional/linked orders
- Order book depth (bid/ask ladder)
- Multi-outcome markets
- Market resolution history
- User trade history with P&L breakdown

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Market order support | High | Low | Currently limit-only; GTC market orders are common |
| Order book depth | Moderate | Low | Useful for price discovery before placing orders |
| Multi-outcome markets | Moderate | Moderate | Requires UI changes for >2 outcomes |
| Trade history with P&L | Low | Low | Better reporting |

---

### <img src="../icons/trading-platforms/kalshi.svg" height="28"> Kalshi (Event Contracts)

**Extension:** `extensions/kalshi/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `email` | string | Yes | Kalshi account email |
| `apiKeyId` | string | Yes | API key ID |
| `privateKeyPath` | string | Yes | Path to RSA private key PEM file |
| `mode` | `"demo"` / `"live"` | No (default: `"demo"`) | Trading mode |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `kalshi_search_events` -- Search open events by series ticker
2. `kalshi_get_market` -- Get market details (ticker, status, prices)
3. `kalshi_place_order` (policy-gated) -- Place orders (yes/no side, prices in cents 1-99)
4. `kalshi_cancel_order` (policy-gated) -- Cancel open orders
5. `kalshi_get_positions` -- Get open positions
6. `kalshi_get_portfolio` -- Get portfolio balance

**Background Sync:** Every 60s -- syncs positions and balance. Tracks market exposure.

**Special:** Prices are in cents (1-99). Estimated ~2% settlement fee factored into policy checks.

**What Kalshi's API Also Supports (Not Yet in Tigerpaw):**

- Batch order placement
- Settlement/payout history
- Portfolio analytics
- Market schedule/expiration details
- Exchange status endpoint

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Batch orders | Low | Moderate | Useful for multi-contract strategies |
| Settlement history | Low | Low | Better P&L tracking |
| Market expiration info | Low | Low | Show contract expiry in market details |

---

### <img src="../icons/trading-platforms/manifold.svg" height="28"> Manifold (Play Money)

**Extension:** `extensions/manifold/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKey` | string | No | Manifold API key (read-only without it) |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `manifold_search_markets` -- Search prediction markets
2. `manifold_get_market` -- Get market details
3. `manifold_place_bet` (policy-gated) -- Place bets (YES/NO, amount in Mana)
4. `manifold_sell_shares` (policy-gated) -- Sell shares
5. `manifold_get_positions` -- Get user profile
6. `manifold_get_balance` -- Get Mana balance

**Background Sync:** Every 60s -- syncs balance (read-only). Does NOT track portfolio value (play money).

**Special:** Uses play money (Mana), not real USD. Policy engine defaults to `auto` approval. Balance is NOT added to cross-platform portfolio calculations.

**What Manifold's API Also Supports (Not Yet in Tigerpaw):**

- Multi-outcome markets (free response, multiple choice)
- Limit orders
- Comments and discussion
- Liquidity provision (market making)
- Market creation
- Leaderboards

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Multi-outcome markets | Moderate | Moderate | Currently only binary YES/NO |
| Limit orders | Low | Low | Manifold supports them |
| Market creation | Low | Moderate | Create new prediction markets |

---

### <img src="../icons/trading-platforms/coinbase.svg" height="28"> Coinbase (Crypto Spot)

**Extension:** `extensions/coinbase/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKey` | string | Yes | CDP Key Name (`organizations/{org_id}/apiKeys/{key_id}`) |
| `apiSecret` | string | Yes | EC P-256 private key (PEM format) |
| `mode` | `"live"` / `"sandbox"` | No (default: `"sandbox"`) | Trading mode |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `coinbase_list_accounts` -- List crypto wallets
2. `coinbase_get_product` -- Get trading pair info (BTC-USD, ETH-USD, etc.)
3. `coinbase_get_ticker` -- Get latest prices
4. `coinbase_place_order` (policy-gated) -- Place orders (market/limit/stop_limit)
5. `coinbase_cancel_order` (policy-gated) -- Cancel orders
6. `coinbase_get_positions` -- Get crypto holdings
7. `coinbase_get_order_history` -- Get recent orders

**Background Sync:** Every 60s -- syncs positions and balances. Estimates portfolio value from USD-like balances (USDT, USDC).

**What Coinbase's API Also Supports (Not Yet in Tigerpaw):**

- Trailing stop orders
- Bracket orders (stop-loss + take-profit)
- Futures trading (Coinbase Derivatives)
- Margin trading
- WebSocket real-time price feeds
- Advanced order types (Good-til-date, Fill-or-kill)
- Transaction history (deposits/withdrawals)

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Bracket orders | Moderate | Moderate | Stop-loss + take-profit in single order |
| Trailing stop | Moderate | Low | Add trailing_stop order type |
| Advanced TIF | Low | Low | Good-til-date, IOC, FOK |
| WebSocket feeds | Low | High | Real-time price streaming |

---

### <img src="../icons/trading-platforms/interactive-brokers.svg" height="28"> Interactive Brokers (Stocks, Options, Futures)

**Extension:** `extensions/ibkr/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `accountId` | string | Yes | IBKR account ID |
| `gatewayHost` | string | No (default: `"localhost:5000"`) | IB Client Portal Gateway host:port |
| `mode` | `"paper"` / `"live"` | No (default: `"paper"`) | Trading mode |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `ibkr_search_contracts` -- Search contracts (STK, OPT, FUT security types)
2. `ibkr_get_quote` -- Get market data by contract ID
3. `ibkr_place_order` (policy-gated) -- Place orders (MKT/LMT/STP/STP_LIMIT)
4. `ibkr_place_bracket_order` (policy-gated) -- Place bracket orders
5. `ibkr_cancel_order` -- Cancel orders
6. `ibkr_get_positions` -- Get open positions
7. `ibkr_get_account` -- Get account summary (NLV, buying power, margin)
8. `ibkr_get_order_history` -- Get recent orders

**Background Sync:** Every 30s -- syncs positions and account summary. Tracks net liquidation value (NLV).

**Special:** Connects to the local IB Client Portal Gateway. Multi-asset: supports stocks, options, and futures security types.

**What IBKR's API Also Supports (Not Yet in Tigerpaw):**

- Algorithmic orders (TWAP, VWAP, Adaptive, etc.)
- Options chain lookup
- Options Greeks/analytics
- Streaming real-time quotes (WebSocket)
- Futures spread orders
- Scanner/screener
- Portfolio margin analysis
- Forex trading
- Historical data bars

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Options chain lookup | High | Moderate | IBKR is the premier options platform; unlock options trading |
| Algo orders (TWAP/VWAP) | Moderate | Moderate | Institutional-grade execution |
| Streaming quotes | Moderate | High | WebSocket-based real-time data |
| Scanner/screener | Low | Moderate | Market scanning capabilities |
| Portfolio margin analysis | Low | Low | Margin requirement calculations |

---

### <img src="../icons/trading-platforms/binance.svg" height="28"> Binance (Crypto Spot)

**Extension:** `extensions/binance/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKey` | string | Yes | Binance API key |
| `apiSecret` | string | Yes | Binance API secret |
| `mode` | `"live"` / `"testnet"` | No (default: `"testnet"`) | Trading mode |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `binance_get_price` -- Get latest price for a symbol
2. `binance_search_symbols` -- Search tradeable pairs
3. `binance_place_order` (policy-gated) -- Place orders (MARKET/LIMIT/STOP_LOSS_LIMIT)
4. `binance_place_oco_order` (policy-gated) -- Place OCO (one-cancels-other) orders
5. `binance_cancel_order` -- Cancel orders
6. `binance_get_balances` -- Get account balances (free/locked)
7. `binance_get_open_orders` -- Get open orders
8. `binance_get_order_history` -- Get all orders for a symbol

**Background Sync:** Every 60s -- syncs balances and estimates portfolio. Converts non-stablecoin balances to USD via ticker lookups.

**What Binance's API Also Supports (Not Yet in Tigerpaw):**

- Trailing stop orders (TRAILING_STOP_MARKET)
- Margin trading (isolated and cross)
- Futures trading (USDM and COIN-M)
- WebSocket real-time streams
- User data stream (real-time order/balance updates)
- Dust conversion (small balance cleanup)
- Savings/earn products
- Auto-invest

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Trailing stop | Moderate | Low | TRAILING_STOP_MARKET order type |
| Margin trading | Low | High | Requires separate margin account management |
| Futures trading | Low | High | Different API endpoints, separate risk model |
| WebSocket streams | Low | High | Real-time price and order updates |

---

### <img src="../icons/trading-platforms/kraken.svg" height="28"> Kraken (Crypto Spot + Margin)

**Extension:** `extensions/kraken/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKey` | string | Yes | Kraken API key |
| `apiSecret` | string | Yes | Kraken API secret (base64-encoded) |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `kraken_get_ticker` -- Get ticker info (XBTUSD, ETHUSD, etc.)
2. `kraken_search_pairs` -- Search tradeable pairs
3. `kraken_place_order` (policy-gated) -- Place orders (market/limit/stop-loss, optional leverage)
4. `kraken_cancel_order` -- Cancel orders
5. `kraken_get_balances` -- Get account balances
6. `kraken_get_positions` -- Get margin positions
7. `kraken_get_order_history` -- Get closed orders (last 50)

**Background Sync:** Every 60s -- syncs balances and margin positions. Estimates portfolio from USD-like balances (ZUSD, USDT, USDC).

**Special:** Supports margin/leverage trading. Low liquidity detection (< 5 trades today) triggers warnings. Uses XBT instead of BTC.

**What Kraken's API Also Supports (Not Yet in Tigerpaw):**

- Trailing stop orders
- Futures trading (Kraken Futures)
- Advanced order types (settle-position, iceberg)
- WebSocket real-time feeds
- Staking
- Earn/savings products
- Withdrawal management

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| Trailing stop | Moderate | Low | Kraken supports trailing stop natively |
| Advanced order types | Low | Low | Iceberg orders for large positions |
| Futures | Low | High | Separate Kraken Futures API |
| WebSocket feeds | Low | High | Real-time price streaming |

---

### <img src="../icons/trading-platforms/dydx.svg" height="28"> dYdX (Decentralized Perpetuals)

**Extension:** `extensions/dydx/`

**Config Fields:**
| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `mnemonic` | string | Yes | Cosmos wallet mnemonic |
| `address` | string | No | dYdX v4 address (derived from mnemonic if omitted) |
| `mode` | `"mainnet"` / `"testnet"` | No (default: `"testnet"`) | Network |
| `syncIntervalMs` | number | No | Background sync interval |

**Implemented Tools:**

1. `dydx_get_markets` -- List perpetual markets
2. `dydx_get_ticker` -- Get market stats (BTC-USD, ETH-USD, etc.)
3. `dydx_place_order` (policy-gated, **STUB**) -- Placeholder for order placement
4. `dydx_cancel_order` (**STUB**) -- Placeholder for order cancellation
5. `dydx_get_positions` -- Get open perpetual positions
6. `dydx_get_balances` -- Get subaccount equity/collateral
7. `dydx_get_order_history` -- Get fills/order history

**Background Sync:** Every 60s -- syncs positions and balances. Tracks unrealized P&L.

**Special:** Leverage/liquidation risk warnings (~5x threshold). Low volume detection (< $10k 24h volume). **ORDER PLACEMENT IS NOT IMPLEMENTED** -- requires Cosmos SDK transaction signing via `@dydxprotocol/v4-client-js`.

**What dYdX's API Supports (Not Yet in Tigerpaw):**

- **Order placement** (requires Cosmos SDK transaction signing)
- **Order cancellation** (requires Cosmos SDK)
- Take-profit / stop-loss orders
- Funding rate queries
- Liquidation info
- WebSocket real-time feeds
- Transfer/withdrawal management

**Enhancement Priority:**
| Feature | Priority | Complexity | Notes |
| ------- | -------- | ---------- | ----- |
| **Order placement** | **Critical** | **High** | Requires `@dydxprotocol/v4-client-js` Cosmos SDK integration |
| **Order cancellation** | **Critical** | **High** | Same dependency as order placement |
| Funding rates | Moderate | Low | Query current funding rate per market |
| Stop-loss / take-profit | Moderate | Moderate | Conditional orders via Cosmos |

---

## Cross-Platform Enhancement Opportunities

### 1. Trailing Stop Orders

Missing from: Alpaca, Coinbase, Binance, Kraken (all support it via their APIs)

**Scope:** Add `trailing_stop` as a new order type in the policy engine's `TradeOrder` type. Each extension adds `trail_percent` / `trail_price` parameters to their order placement tool.

### 2. dYdX Order Placement (Critical Gap)

dYdX is the only platform where trading is completely non-functional. Requires adding `@dydxprotocol/v4-client-js` as a dependency to the dYdX extension and implementing Cosmos SDK transaction signing for `MsgPlaceOrder` and `MsgCancelOrder`.

### 3. Options Chain for IBKR

IBKR is the premier options trading platform, and the extension already supports OPT security type in contract search. Adding an `ibkr_get_options_chain` tool would unlock options trading -- showing strikes, expirations, Greeks, and open interest.

### 4. Bracket Orders for Coinbase and Binance

Currently only Alpaca and IBKR have bracket orders. Both Coinbase and Binance APIs support placing linked stop-loss + take-profit orders.

### 5. Per-Platform Risk Profiles

Already supported via `perExtension` config but not prominently documented. Recommendation: add sensible defaults per asset class:

- Crypto platforms (Coinbase, Binance, Kraken): tighter drawdown limits due to volatility
- Prediction markets (Polymarket, Kalshi): lower max position sizes (binary risk)
- Play money (Manifold): auto approval, relaxed limits
- Traditional equities (Alpaca, IBKR): standard moderate tier

---

## Implementation Priority Matrix

| Priority | Feature                 | Platforms                         | Complexity    |
| -------- | ----------------------- | --------------------------------- | ------------- |
| Critical | dYdX order placement    | dYdX                              | High          |
| High     | Options chain lookup    | IBKR                              | Moderate      |
| High     | Market order support    | Polymarket                        | Low           |
| Moderate | Trailing stop orders    | Alpaca, Coinbase, Binance, Kraken | Low each      |
| Moderate | Bracket orders          | Coinbase, Binance                 | Moderate each |
| Moderate | Multi-outcome markets   | Manifold                          | Moderate      |
| Moderate | Crypto trading          | Alpaca                            | Moderate      |
| Low      | Fractional shares       | Alpaca                            | Low           |
| Low      | Advanced TIF            | Coinbase                          | Low           |
| Low      | Algo orders (TWAP/VWAP) | IBKR                              | Moderate      |
| Low      | Margin trading          | Binance                           | High          |
| Low      | Futures trading         | Binance, Kraken                   | High          |
