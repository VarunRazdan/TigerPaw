# Tigerpaw Feature Roadmap

## Next Up

### ~~Dual Auth for Google Integrations~~ DONE

Shipped: OAuth2 + Service Account (domain-wide delegation) for Gmail, Google Calendar, Google Meet, and Google Sheets. API Key option was dropped — Google API keys only grant access to public data, not user-scoped APIs like Gmail or Calendar.

- **OAuth2**: browser-based consent per user. Best for personal accounts.
- **Service Account**: GCP service account with domain-wide delegation. Best for Workspace admins — no per-user consent needed. Paste the SA JSON key + impersonation email in the UI.

UI shows a method picker when connecting any Google provider. Service account connections display a badge. Scopes are shown in the setup dialog. Private keys are encrypted at rest via the credential vault.

### SSRF Protection

Add URL validation for custom/ollama/lmstudio provider base URLs:

- Validate scheme (http/https only)
- Block private IP ranges for custom providers
- Allow localhost only for ollama/lmstudio

### Exchange Integrations (Beyond Alpaca)

Complete live trading backends for Polymarket, Coinbase, Binance, Kraken, dYdX, Interactive Brokers, Kalshi, Manifold. Currently these show demo data in the UI. Alpaca is the only fully live integration.

### System Prompt Per-User Threading

Wire agentName and senderDisplayName through the primary agent runner path so the identity system is fully active during all conversations.

### OpenClaw Legacy Path Cleanup

Rename remaining openclaw references in log paths, canvas mount, launchd service name, and security audit messages.

---

## Completed Features

### Intelligent Model Routing

Auto-switch between AI providers based on detected intent (search, code, reasoning, creative). Regex-based classifier, zero LLM overhead. User-configurable routing rules from the Models page UI.

### Pairing UX Improvement

Sender sees a friendly "Tigerpaw: Hi! I'm not set up to chat with you yet." message. Owner receives a private WhatsApp notification with the sender's name, phone, and approval command. Rate-limited to prevent flooding.

### Integration Credential Setup UI

OAuth credentials for Gmail, Google Calendar, Outlook, Zoom, and other integrations can now be configured from the UI. Setup dialog with step-by-step instructions, credential fields, and one-click "Save & Connect". Added as Step 3 in the onboarding wizard. Credentials stored in config (env vars still supported as fallback).

### WhatsApp @TP Trigger & Group Management

`@TP` prefix system for WhatsApp -- bot only responds when explicitly addressed. Works in DMs and groups. Owner can trigger bot in other people's chats. `!group add/remove/list` commands for managing group access directly from WhatsApp. Group JID allowlisting fixed. Owner messages bypass group policy for admin commands.

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
