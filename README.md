<p align="center">
  <img src=".github/tigerpaw-logo.png" alt="Tigerpaw" width="120" />
</p>

<h1 align="center">Tigerpaw</h1>

<p align="center">
  Multi-channel AI trading gateway. Connect AI agents to messaging platforms and real-money trading platforms with built-in risk management.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@greatlyrecommended/tigerpaw"><img src="https://img.shields.io/npm/v/@greatlyrecommended/tigerpaw?color=orange" alt="npm" /></a>
  <a href="https://github.com/varunrazdan/tigerpaw/actions/workflows/ci.yml"><img src="https://github.com/varunrazdan/tigerpaw/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/varunrazdan/tigerpaw/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node >= 22" />
</p>

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Install](#install)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Trading Setup](#trading-setup)
  - [Trading Config Reference](#trading-config-reference)
  - [Trading Platforms](#trading-platforms)
  - [Risk Tiers](#risk-tiers)
  - [Per-Extension Overrides](#per-extension-overrides)
  - [Approval Modes](#approval-modes)
  - [Kill Switch](#kill-switch)
  - [Pre-Trade Validation Pipeline](#pre-trade-validation-pipeline)
  - [Audit Log](#audit-log)
- [CLI Commands](#cli-commands)
- [Development](#development)
- [Security](#security)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Features

- **9 Trading Platforms** --
  <img src="icons/trading-platforms/alpaca.svg" height="14" alt="Alpaca"> Alpaca
  · <img src="icons/trading-platforms/polymarket.svg" height="14" alt="Polymarket"> Polymarket
  · <img src="icons/trading-platforms/kalshi.svg" height="14" alt="Kalshi"> Kalshi
  · <img src="icons/trading-platforms/manifold.svg" height="14" alt="Manifold"> Manifold
  · <img src="icons/trading-platforms/coinbase.svg" height="14" alt="Coinbase"> Coinbase
  · <img src="icons/trading-platforms/interactive-brokers.svg" height="14" alt="Interactive Brokers"> Interactive Brokers
  · <img src="icons/trading-platforms/binance.svg" height="14" alt="Binance"> Binance
  · <img src="icons/trading-platforms/kraken.svg" height="14" alt="Kraken"> Kraken
  · <img src="icons/trading-platforms/dydx.svg" height="14" alt="dYdX"> dYdX

- **20+ Messaging Channels** --
  <img src="icons/messaging-channels/telegram.svg" height="14" alt="Telegram"> Telegram
  · <img src="icons/messaging-channels/discord.svg" height="14" alt="Discord"> Discord
  · <img src="icons/messaging-channels/slack.svg" height="14" alt="Slack"> Slack
  · <img src="icons/messaging-channels/signal.svg" height="14" alt="Signal"> Signal
  · <img src="icons/messaging-channels/imessage.svg" height="14" alt="iMessage"> iMessage
  · <img src="icons/messaging-channels/whatsapp.svg" height="14" alt="WhatsApp"> WhatsApp
  · <img src="icons/messaging-channels/matrix.svg" height="14" alt="Matrix"> Matrix
  · <img src="icons/messaging-channels/ms-teams.svg" height="14" alt="MS Teams"> MS Teams
  · <img src="icons/messaging-channels/irc.svg" height="14" alt="IRC"> IRC
  · <img src="icons/messaging-channels/line.svg" height="14" alt="Line"> Line
  · <img src="icons/messaging-channels/nostr.svg" height="14" alt="Nostr"> Nostr
  · <img src="icons/messaging-channels/google-chat.svg" height="14" alt="Google Chat"> Google Chat
  · <img src="icons/messaging-channels/mattermost.svg" height="14" alt="Mattermost"> Mattermost
  · <img src="icons/messaging-channels/twitch.svg" height="14" alt="Twitch"> Twitch
  · <img src="icons/messaging-channels/feishu.svg" height="14" alt="Feishu"> Feishu
  · <img src="icons/messaging-channels/zalo.svg" height="14" alt="Zalo"> Zalo
  and more

- **Policy-Gated Trading** -- Every order goes through a 12-step validation pipeline before execution
- **Risk Management** -- Daily spend limits, position limits, drawdown protection, cooldowns, kill switch
- **Tamper-Evident Audit Log** -- HMAC-SHA256 chain-linked JSONL logging for every trade decision
- **3 Approval Modes** -- Auto, confirm (15s timeout), or manual (5min timeout)
- **3 Risk Tiers** -- Conservative, moderate, aggressive presets
- **React Control UI** -- Dashboard with real-time positions, P&L charts, TradingView embeds, order entry, risk management, and approval queue

## Screenshots

<p align="center">
  <img src=".github/screenshots/trading-hub.png" alt="Trading Hub" width="720" />
  <br />
  <em>Trading Hub — Live positions, risk gauges, approval queue, and trade history</em>
</p>

<p align="center">
  <img src=".github/screenshots/dashboard.png" alt="Dashboard" width="720" />
  <br />
  <em>Dashboard — Portfolio overview, daily P&L chart, and extension status</em>
</p>

<p align="center">
  <img src=".github/screenshots/trading-settings.png" alt="Trading Settings" width="720" />
  <br />
  <em>Risk Settings — Risk tier selection, approval mode, and configurable limits</em>
</p>

<p align="center">
  <img src=".github/screenshots/channels.png" alt="Channels" width="720" />
  <br />
  <em>Channels — Manage messaging integrations (Discord, Telegram, Slack, Signal, etc.)</em>
</p>

<p align="center">
  <img src=".github/screenshots/config.png" alt="Configuration" width="720" />
  <br />
  <em>Configuration — JSON config editor with live validation</em>
</p>

<p align="center">
  <img src=".github/screenshots/security.png" alt="Security Dashboard" width="720" />
  <br />
  <em>Security — Audit findings, credential status, and extension permissions</em>
</p>

## Install

```bash
npm install -g @greatlyrecommended/tigerpaw
```

Requires Node.js 22+.

### From Source

```bash
git clone https://github.com/varunrazdan/tigerpaw.git
cd tigerpaw
pnpm install
pnpm build
```

## Quick Start

```bash
# Start the gateway (serves the Control UI at http://localhost:18789)
tigerpaw gateway run --dev --allow-unconfigured

# Add a messaging channel
tigerpaw channels add --interactive

# Check system health
tigerpaw doctor
```

## Configuration

Config lives at `~/.tigerpaw/tigerpaw.json`.

```bash
tigerpaw config set gateway.port 18789
tigerpaw config get
```

### Trading Setup

Add a `trading` block to your config:

```json
{
  "trading": {
    "enabled": true,
    "mode": "paper",
    "policy": {
      "tier": "conservative",
      "approvalMode": "confirm",
      "confirm": { "timeoutMs": 15000, "showNotification": true },
      "manual": { "timeoutMs": 300000 },
      "limits": {
        "maxDailySpendUsd": 100,
        "maxSingleTradeUsd": 25,
        "maxTradesPerDay": 10,
        "maxOpenPositions": 3,
        "maxRiskPerTradePercent": 1,
        "maxSinglePositionPercent": 5,
        "dailyLossLimitPercent": 3,
        "maxPortfolioDrawdownPercent": 10,
        "cooldownBetweenTradesMs": 60000,
        "consecutiveLossPause": 3
      },
      "perExtension": {
        "alpaca": { "maxSingleTradeUsd": 50, "approvalMode": "manual" },
        "manifold": { "approvalMode": "auto" }
      }
    },
    "auditLog": {
      "maxFileSizeMb": 50,
      "rotateCount": 5
    }
  }
}
```

### Trading Config Reference

| Field                                | Type                                                          | Default          | Description                                     |
| ------------------------------------ | ------------------------------------------------------------- | ---------------- | ----------------------------------------------- |
| `trading.enabled`                    | `boolean`                                                     | `false`          | Enable the trading subsystem                    |
| `trading.mode`                       | `"paper"` / `"live"`                                          | `"paper"`        | Paper simulates; live uses real money           |
| `policy.tier`                        | `"conservative"` / `"moderate"` / `"aggressive"` / `"custom"` | `"conservative"` | Risk preset (`custom` = manual limits)          |
| `policy.approvalMode`                | `"auto"` / `"confirm"` / `"manual"`                           | Varies by tier   | How orders are approved                         |
| `policy.confirm.timeoutMs`           | `number`                                                      | `15000`          | Confirm mode timeout (ms)                       |
| `policy.confirm.showNotification`    | `boolean`                                                     | `true`           | Show UI notification for confirm requests       |
| `policy.manual.timeoutMs`            | `number`                                                      | `300000`         | Manual approval timeout (ms)                    |
| `limits.maxDailySpendUsd`            | `number`                                                      | Tier-dependent   | Max cumulative daily notional spend (USD)       |
| `limits.maxSingleTradeUsd`           | `number`                                                      | Tier-dependent   | Max single order size (USD)                     |
| `limits.maxTradesPerDay`             | `number`                                                      | Tier-dependent   | Max trades per calendar day (UTC)               |
| `limits.maxOpenPositions`            | `number`                                                      | Tier-dependent   | Max concurrent open positions                   |
| `limits.maxRiskPerTradePercent`      | `number`                                                      | Tier-dependent   | Max % of portfolio risked per trade             |
| `limits.maxSinglePositionPercent`    | `number`                                                      | Tier-dependent   | Max % of portfolio in one asset                 |
| `limits.dailyLossLimitPercent`       | `number`                                                      | Tier-dependent   | Daily loss trigger (% of portfolio)             |
| `limits.maxPortfolioDrawdownPercent` | `number`                                                      | Tier-dependent   | Drawdown from high-water mark trigger (%)       |
| `limits.cooldownBetweenTradesMs`     | `number`                                                      | Tier-dependent   | Min time between trades (ms)                    |
| `limits.consecutiveLossPause`        | `number`                                                      | Tier-dependent   | Consecutive losses before auto-pause            |
| `policy.perExtension.<name>`         | `object`                                                      | --               | Override any limit or approvalMode per platform |
| `auditLog.maxFileSizeMb`             | `number`                                                      | `50`             | Audit log rotation threshold (MB)               |
| `auditLog.rotateCount`               | `number`                                                      | `5`              | Number of rotated log files to keep             |

> **Live mode safety:** When `mode` is `"live"`, ALL limit fields must be finite positive numbers. Tigerpaw refuses to start with `Infinity` or missing limits in live mode. Paper mode allows relaxed limits for testing.

### Trading Platforms

Configure the platform you want to use in the `plugins` section:

|                                                                         | Platform                        | Config Key   | Mode               | Order Types                              | Auth         |
| ----------------------------------------------------------------------- | ------------------------------- | ------------ | ------------------ | ---------------------------------------- | ------------ |
| <img src="icons/trading-platforms/alpaca.svg" height="20">              | Alpaca (stocks)                 | `alpaca`     | `paper` / `live`   | market, limit, stop, stop_limit, bracket | API Key      |
| <img src="icons/trading-platforms/polymarket.svg" height="20">          | Polymarket (prediction markets) | `polymarket` | `live`             | limit                                    | HMAC-SHA256  |
| <img src="icons/trading-platforms/kalshi.svg" height="20">              | Kalshi (event contracts)        | `kalshi`     | `demo` / `live`    | market, limit                            | RSA-SHA256   |
| <img src="icons/trading-platforms/manifold.svg" height="20">            | Manifold (play money)           | `manifold`   | `live`             | market (implicit)                        | Bearer token |
| <img src="icons/trading-platforms/coinbase.svg" height="20">            | Coinbase (crypto)               | `coinbase`   | `sandbox` / `live` | market, limit, stop_limit                | ES256 JWT    |
| <img src="icons/trading-platforms/interactive-brokers.svg" height="20"> | Interactive Brokers             | `ibkr`       | `paper` / `live`   | MKT, LMT, STP, STP_LIMIT, bracket        | Session      |
| <img src="icons/trading-platforms/binance.svg" height="20">             | Binance (crypto)                | `binance`    | `testnet` / `live` | MARKET, LIMIT, STOP_LOSS_LIMIT, OCO      | HMAC-SHA256  |
| <img src="icons/trading-platforms/kraken.svg" height="20">              | Kraken (crypto + margin)        | `kraken`     | `live`             | market, limit, stop-loss + leverage      | HMAC-SHA512  |
| <img src="icons/trading-platforms/dydx.svg" height="20">                | dYdX (perpetuals)               | `dydx`       | `testnet` / `live` | market, limit (read-only)                | Cosmos SDK   |

Example (Alpaca):

```json
{
  "plugins": {
    "alpaca": {
      "apiKeyId": "${ALPACA_API_KEY_ID}",
      "apiSecretKey": "${ALPACA_API_SECRET_KEY}",
      "mode": "paper"
    }
  }
}
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for all platform configurations.

### Risk Tiers

| Parameter              | Conservative | Moderate      | Aggressive |
| ---------------------- | ------------ | ------------- | ---------- |
| Approval Mode          | Manual       | Confirm (15s) | Auto       |
| Max Daily Spend        | $100         | $500          | $2,000     |
| Max Single Trade       | $25          | $100          | $500       |
| Max Trades/Day         | 10           | 25            | 50         |
| Max Open Positions     | 3            | 8             | 20         |
| Risk Per Trade         | 1%           | 2%            | 5%         |
| Single Position Cap    | 5%           | 10%           | 15%        |
| Daily Loss Limit       | 3%           | 5%            | 10%        |
| Portfolio Drawdown     | 10%          | 20%           | 30%        |
| Cooldown               | 60s          | 30s           | 10s        |
| Consecutive Loss Pause | 3            | 5             | 8          |

Set `"tier": "custom"` to define your own limits without using a preset.

### Per-Extension Overrides

Override limits or approval mode for individual platforms:

```json
{
  "policy": {
    "tier": "moderate",
    "perExtension": {
      "alpaca": { "maxSingleTradeUsd": 200, "approvalMode": "manual" },
      "polymarket": { "maxDailySpendUsd": 50, "maxOpenPositions": 5 },
      "manifold": { "approvalMode": "auto" }
    }
  }
}
```

Any limit field or `approvalMode` can be overridden per platform. Unset fields inherit from the global policy.

### Approval Modes

- **Auto** -- Orders within limits execute immediately. Best for paper mode or aggressive tier.
- **Confirm** -- 15-second confirmation popup in the UI. Auto-approves on timeout. Configurable via `confirm.timeoutMs`.
- **Manual** -- Every trade requires explicit operator approval. Auto-denies after 5 minutes. Configurable via `manual.timeoutMs`.

### Kill Switch

```bash
tigerpaw trading kill     # Halt all trading immediately (hard mode)
tigerpaw trading resume   # Resume trading
```

Two modes:

- **Hard** (default) -- Blocks ALL trading: buys, sells, and cancels all denied
- **Soft** -- Allows sells and cancels (position exit only); blocks new buys

Auto-activates when any of these thresholds are breached:

1. Daily loss >= `dailyLossLimitPercent`
2. Portfolio drawdown >= `maxPortfolioDrawdownPercent`
3. Consecutive losses >= `consecutiveLossPause`

### Pre-Trade Validation Pipeline

Every order passes through 12 sequential checks before execution. The first failure denies the order.

| #   | Check                  | What It Validates                                          |
| --- | ---------------------- | ---------------------------------------------------------- |
| 0   | Kill Switch            | Is global or platform kill switch active?                  |
| 1   | Kill Switch Auto       | Should kill switch auto-activate based on current state?   |
| 2   | Numeric Sanity         | Are order fields valid (finite, non-zero notional on buy)? |
| 3   | Cooldown               | Has enough time passed since the last trade?               |
| 4   | Balance Check          | Does this trade risk more than `maxRiskPerTradePercent`?   |
| 5   | Per-Trade Size         | Does notional exceed `maxSingleTradeUsd`?                  |
| 6   | Daily Loss             | Has daily loss reached `dailyLossLimitPercent`?            |
| 7   | Position Concentration | Would this exceed `maxSinglePositionPercent` in one asset? |
| 8   | Max Open Positions     | Are we at the `maxOpenPositions` cap?                      |
| 9   | Max Trades/Day         | Have we hit `maxTradesPerDay`?                             |
| 10  | Daily Spend            | Would cumulative spend exceed `maxDailySpendUsd`?          |
| 11  | Consecutive Losses     | Have we hit `consecutiveLossPause` losing trades in a row? |

### Audit Log

Every trade decision is logged to `~/.tigerpaw/trading/audit.jsonl` with HMAC-SHA256 chain linking for tamper evidence. The log rotates at 50 MB (configurable) and keeps 5 archived files. Each entry records the action, actor, order snapshot, policy snapshot, and a chain hash linking to the previous entry.

### Order Execution

The Control UI includes order entry forms on each platform page. Orders are submitted via the gateway's `/tools/invoke` HTTP endpoint, which:

1. Resolves the correct extension tool (e.g., `alpaca_place_order`)
2. Runs the order through the 12-step policy validation pipeline
3. Applies the configured approval mode (auto/confirm/manual)
4. Logs the decision to the tamper-evident audit log
5. Returns the result to the UI

Orders can also be placed via messaging channels -- any connected AI agent can invoke trading tools, subject to the same policy gates.

## Environment Variables

| Variable                 | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `TIGERPAW_STATE_DIR`     | Override state directory (default: `~/.tigerpaw`) |
| `TIGERPAW_GATEWAY_PORT`  | Gateway port override                             |
| `TIGERPAW_GATEWAY_TOKEN` | Gateway auth token                                |

Credentials use `SecretRef` syntax -- never hardcode API keys:

```json
{ "apiKey": "${MY_ENV_VAR}" }
```

## CLI Commands

```bash
tigerpaw gateway run              # Start gateway
tigerpaw channels list            # List channels
tigerpaw channels status --probe  # Health check
tigerpaw doctor                   # Diagnostics + security audit
tigerpaw status --all             # Full system status
tigerpaw config get               # Show config
```

## Control UI

The gateway serves a React dashboard at `http://localhost:18789` with:

- **Dashboard** -- Portfolio overview, daily P&L chart, extension status, and market prices
- **Trading Hub** -- Positions, trade history, approval queue, and risk gauges
- **Platform Pages** -- Dedicated pages for each of the 9 trading platforms with TradingView charts (collapsible), order entry forms, and platform-specific data
- **Channels** -- Manage 20+ messaging integrations
- **Settings** -- Risk tier selection, approval mode, per-extension overrides
- **Security** -- Audit findings, credential rotation status, extension permissions
- **Config** -- JSON config editor with live validation

## Development

```bash
pnpm build          # Compile TypeScript
pnpm ui:build       # Build React UI
pnpm check          # Lint + format
pnpm test:fast      # Unit tests
pnpm test           # All tests
```

## File Locations

| Purpose         | Path                                    |
| --------------- | --------------------------------------- |
| Config          | `~/.tigerpaw/tigerpaw.json`             |
| Credentials     | `~/.tigerpaw/credentials/`              |
| Trade audit log | `~/.tigerpaw/trading/audit.jsonl`       |
| Policy state    | `~/.tigerpaw/trading/policy-state.json` |
| Sessions        | `~/.tigerpaw/sessions/`                 |

## Security

- **Policy-gated trading**: Every order passes through 10 pre-trade checks; extensions fail-safe (block orders) when the policy engine is unavailable
- **HMAC-signed requests**: API secrets are never sent as plaintext headers
- **Tamper-evident audit log**: HMAC-SHA256 chain-linked JSONL for every trade decision
- **Kill switch**: Instant halt with auto-activation on limit breach

See [SECURITY.md](SECURITY.md) for the full security architecture and vulnerability disclosure policy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgments

Tigerpaw began as a fork of [OpenClaw](https://github.com/nicepkg/openclaw) by Peter Steinberger, originally a multi-channel AI messaging gateway. It has since been extensively rebuilt with a policy-gated trading engine, 9 exchange integrations, HMAC-signed request authentication, tamper-evident audit logging, and a React trading dashboard — transforming it into a full trading gateway with hardened security.

## Support

If you find Tigerpaw useful, consider supporting development:

<a href="https://buymeacoffee.com/CrimesAnatomy"><img src="https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" /></a>

<p align="center">
  <a href="https://buymeacoffee.com/CrimesAnatomy"><img src=".github/buy-me-a-coffee-qr.png" alt="Donate QR Code" width="200" /></a>
</p>

## License

[MIT](LICENSE)
