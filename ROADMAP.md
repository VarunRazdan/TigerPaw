# Tigerpaw Feature Roadmap

## Completed Features

### F1: README Positioning

- Updated README with clear product positioning and feature highlights

### F2: Retry Logic on Failed Orders

- Exponential backoff with jitter (1s/2s/4s, capped 5s, +/-25% jitter)
- Transient vs permanent error classification
- `retryToolInvoke()` and `retryAsync()` utilities in `ui/src/lib/retry.ts`
- Integrated into `useSubmitOrder`, `useClosePosition`, and workflow trade actions
- UI: retry button, attempt counter, status messaging

### F3: Realized P&L Tracking

- `recordTradeFill()` in `src/trading/realized-pnl.ts` — single entry point for P&L flow
- Updates `dailyPnlUsd`, `consecutiveLosses`, `highWaterMarkUsd`, `dailySpendUsd`
- Gateway RPC: `trading.recordFill` with validation
- TradeHistoryTable P&L column with green/red coloring
- RiskOverviewPanel header with realized P&L badge

### F4: Risk Metrics (Sharpe, Sortino, Drawdown)

- Pure computation in `ui/src/lib/risk-metrics.ts`
- Annualized Sharpe & Sortino ratios (5% risk-free, 252 trading days)
- Max drawdown, win rate, profit factor, avg win/loss
- `RiskMetricsPanel` with 5-column grid + color coding
- Integrated between P&L chart and trade history on TradingPage

### F5: Real-time WebSocket Order Updates

- WebSocket event handling for 9 trading event types
- Adaptive polling: 30s (WS disconnected) / 120s (WS connected)
- Live/Polling connection status indicator on TradingPage
- Event-driven store mutations (addPendingApproval, addTradeHistoryEntry, etc.)

### F6: Strategy Automation Framework

- **Types**: `StrategyDefinition`, `SignalConfig`, `EntryRule`, `ExitRule`, `PositionSizing`
- **Signal engine**: 10 evaluators (price cross, momentum, mean reversion, RSI, volatility breakout, custom)
- **Registry**: JSON-persisted CRUD with execution history (last 500)
- **Runner**: Evaluates signals per symbol, calculates position size (fixed/percent/Kelly/risk parity), checks per-strategy risk controls
- **Gateway**: 8 RPC methods (`strategies.list/get/save/delete/toggle/execute/executions/clearHistory`)
- **UI**: `StrategiesPage` with 3-column layout, strategy cards, detail view, signal/rule display

### F7: Backtesting Engine

- **OHLCV generator**: Seeded GBM with 5 patterns (trending up/down, mean-reverting, volatile, random)
- **Engine**: Bar-by-bar simulation with signal evaluation, stop-loss/take-profit exits, commission/slippage modeling
- **Metrics**: Full risk suite (Sharpe, Sortino, max DD, Calmar, win rate, profit factor, annualized return)
- **Gateway**: `backtest.run` and `backtest.generate` RPC methods
- **UI**: `BacktestPanel` with config controls + 9-metric results grid, `EquityCurveChart` (Recharts area chart)

### F8: Functional MCP Server

- **Server**: Lightweight stdio JSON-RPC 2.0 MCP server (no SDK dependency)
- **8 tools**: `get_trading_state`, `get_positions`, `place_order`, `toggle_kill_switch`, `get_trade_history`, `get_risk_metrics`, `list_strategies`, `run_backtest`
- **Gateway**: `mcp.server.test` and `mcp.server.refreshToken` handlers added
- **Protocol**: Handles `initialize`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`, `ping`
