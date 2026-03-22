<p align="center">
  <img src=".github/tigerpaw-logo.png" alt="Tigerpaw" width="120" />
</p>

<h1 align="center">Tigerpaw</h1>

<p align="center">
  Multi-channel AI trading gateway. Connect AI agents to messaging platforms and real-money trading platforms with built-in risk management.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tigerpaw"><img src="https://img.shields.io/npm/v/tigerpaw?color=orange" alt="npm" /></a>
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
- [CLI Commands](#cli-commands)
- [Development](#development)
- [Security](#security)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Features

- **9 Trading Platforms** -- Alpaca (stocks), Polymarket (prediction markets), Kalshi (event contracts), Manifold (play money), Coinbase (crypto), Interactive Brokers (stocks/options/futures), Binance (crypto), Kraken (crypto), dYdX (perpetuals)
- **15+ Messaging Channels** -- Telegram, Discord, Slack, Signal, iMessage, WhatsApp, Matrix, MS Teams, IRC, Line, Nostr, Google Chat, and more
- **Policy-Gated Trading** -- Every order goes through a 10-check validation pipeline before execution
- **Risk Management** -- Daily spend limits, position limits, drawdown protection, cooldowns, kill switch
- **Tamper-Evident Audit Log** -- HMAC-SHA256 chain-linked JSONL logging for every trade decision
- **3 Approval Modes** -- Auto, confirm (15s timeout), or manual (5min timeout)
- **3 Risk Tiers** -- Conservative, moderate, aggressive presets
- **React Control UI** -- Dashboard with real-time positions, P&L charts, risk gauges, trade history

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

## Install

```bash
npm install -g tigerpaw
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
      "limits": {
        "maxDailySpendUsd": 100,
        "maxSingleTradeUsd": 25,
        "maxTradesPerDay": 10,
        "maxOpenPositions": 3,
        "dailyLossLimitPercent": 3,
        "maxPortfolioDrawdownPercent": 10,
        "cooldownBetweenTradesMs": 60000,
        "consecutiveLossPause": 3
      }
    }
  }
}
```

### Trading Platforms

Configure the platform you want to use in the `plugins` section:

| Platform                        | Config Key   | Mode               |
| ------------------------------- | ------------ | ------------------ |
| Alpaca (stocks)                 | `alpaca`     | `paper` / `live`   |
| Polymarket (prediction markets) | `polymarket` | `live`             |
| Kalshi (event contracts)        | `kalshi`     | `live`             |
| Manifold (play money)           | `manifold`   | `live`             |
| Coinbase (crypto)               | `coinbase`   | `sandbox` / `live` |
| Interactive Brokers             | `ibkr`       | `paper` / `live`   |
| Binance (crypto)                | `binance`    | `testnet` / `live` |
| Kraken (crypto)                 | `kraken`     | `live`             |
| dYdX (perpetuals)               | `dydx`       | `testnet` / `live` |

Example (Alpaca):

```json
{
  "plugins": {
    "alpaca": {
      "apiKey": "${ALPACA_API_KEY}",
      "secretKey": "${ALPACA_SECRET_KEY}",
      "mode": "paper"
    }
  }
}
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for all platform configurations.

### Risk Tiers

| Parameter        | Conservative | Moderate      | Aggressive |
| ---------------- | ------------ | ------------- | ---------- |
| Approval Mode    | Manual       | Confirm (15s) | Auto       |
| Max Daily Spend  | $100         | $500          | $2,000     |
| Max Single Trade | $25          | $100          | $500       |
| Max Trades/Day   | 10           | 25            | 50         |
| Daily Loss Limit | 3%           | 5%            | 10%        |
| Cooldown         | 60s          | 30s           | 10s        |

### Kill Switch

```bash
tigerpaw trading kill     # Halt all trading immediately
tigerpaw trading resume   # Resume trading
```

Auto-activates when daily loss, drawdown, or consecutive loss limits are breached.

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

## License

[MIT](LICENSE)
