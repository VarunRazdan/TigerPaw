# Tigerpaw - Getting Started Guide

Tigerpaw is a multi-channel AI gateway with real-money trading capabilities. It connects your AI agent to messaging platforms (Telegram, Discord, Slack, etc.) and trading platforms (Alpaca, Polymarket, Kalshi, Manifold).

---

## Installation

### Prerequisites

- **Node.js 22+**
- **pnpm** (recommended) or npm

### From npm

```bash
npm install -g @greatlyrecommended/tigerpaw
```

### From Source

```bash
git clone https://github.com/varunrazdan/tigerpaw.git
cd tigerpaw
pnpm install
pnpm build
```

Verify installation:

```bash
tigerpaw --version
# Tigerpaw 2026.3.11
```

> **Upgrading from OpenClaw?** Tigerpaw automatically detects and uses your
> existing `~/.openclaw/` config. The `openclaw` CLI command still works as
> an alias. No migration steps needed.

---

## First-Time Setup

For guided interactive setup:

```bash
tigerpaw setup                      # Create minimal config
tigerpaw channels add --interactive # Add messaging channel with wizard
tigerpaw doctor                     # Verify everything works
```

Or follow the manual steps below.

---

## Quick Start

### 1. Start the Gateway

The gateway is the core server that routes messages and manages trading.

```bash
# Start with dev mode (auto-creates config)
tigerpaw gateway run --dev --allow-unconfigured

# Or start with explicit settings
tigerpaw gateway run --port 18789 --bind loopback --auth token --token "your-secret-token"
```

The **Control UI** (React dashboard) is served at `http://localhost:18789/`.

### 2. Add a Messaging Channel

```bash
# Interactive wizard
tigerpaw channels add --interactive

# Or directly
tigerpaw channels add --channel telegram --token "123456:ABC-your-bot-token"
tigerpaw channels add --channel discord --bot-token "..." --app-token "..."
```

### 3. Check Status

```bash
tigerpaw status
tigerpaw channels status --probe
tigerpaw doctor
```

---

## Configuration

Config lives at `~/.tigerpaw/tigerpaw.json`. Edit it directly or use the CLI:

```bash
tigerpaw config set gateway.mode local
tigerpaw config set gateway.port 18789
tigerpaw config get
```

### Example Config

```json
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${TIGERPAW_GATEWAY_TOKEN}"
    },
    "controlUi": {
      "enabled": true
    }
  },
  "channels": {
    "telegram": {
      "accounts": {
        "default": {
          "botToken": "${TELEGRAM_BOT_TOKEN}"
        }
      }
    }
  }
}
```

### Environment Variables

| Variable                              | Purpose                                           |
| ------------------------------------- | ------------------------------------------------- |
| `TIGERPAW_STATE_DIR`                  | Override state directory (default: `~/.tigerpaw`) |
| `TIGERPAW_GATEWAY_PORT`               | Gateway port override                             |
| `TIGERPAW_GATEWAY_TOKEN`              | Gateway auth token                                |
| `OPENAI_API_KEY`                      | OpenAI model access                               |
| `ANTHROPIC_API_KEY`                   | Anthropic/Claude model access                     |
| `TELEGRAM_BOT_TOKEN`                  | Telegram bot token                                |
| `DISCORD_BOT_TOKEN`                   | Discord bot token                                 |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` | Slack tokens                                      |

### Secrets

Never hardcode API keys. Use `SecretRef` syntax in config:

```json
{
  "token": "${MY_ENV_VAR}"
}
```

This resolves the value from the `MY_ENV_VAR` environment variable at runtime. Tigerpaw also supports keychain storage (macOS Keychain, Linux secret-tool) and file-based secrets.

---

## Trading Setup

### Enable Trading

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
        "maxRiskPerTradePercent": 1,
        "maxSinglePositionPercent": 5,
        "cooldownBetweenTradesMs": 60000,
        "consecutiveLossPause": 3
      }
    }
  }
}
```

### Risk Tiers

| Parameter        | Conservative | Moderate      | Aggressive |
| ---------------- | ------------ | ------------- | ---------- |
| Approval Mode    | Manual       | Confirm (15s) | Auto       |
| Max Daily Spend  | $100         | $500          | $2,000     |
| Max Single Trade | $25          | $100          | $500       |
| Max Trades/Day   | 10           | 25            | 50         |
| Daily Loss Limit | 3%           | 5%            | 10%        |
| Cooldown         | 60s          | 30s           | 10s        |

### Approval Modes

- **Auto** - Trades within limits execute immediately
- **Confirm** - 15-second confirmation popup (auto-approves on timeout)
- **Manual** - Every trade requires explicit approval (5-minute timeout, auto-denies)

### Trading Extensions

Configure the trading platform you want to use:

**Alpaca (Stocks)**

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

**Polymarket (Prediction Markets)**

```json
{
  "plugins": {
    "polymarket": {
      "apiKey": "${POLYMARKET_API_KEY}",
      "apiSecret": "${POLYMARKET_API_SECRET}",
      "passphrase": "${POLYMARKET_PASSPHRASE}",
      "privateKey": "${POLYMARKET_PRIVATE_KEY}"
    }
  }
}
```

**Kalshi (Event Contracts)**

```json
{
  "plugins": {
    "kalshi": {
      "email": "${KALSHI_EMAIL}",
      "apiKeyId": "${KALSHI_API_KEY_ID}",
      "privateKeyPath": "~/.kalshi/private.pem",
      "mode": "demo"
    }
  }
}
```

**Manifold (Play Money)**

```json
{
  "plugins": {
    "manifold": {
      "apiKey": "${MANIFOLD_API_KEY}"
    }
  }
}
```

**Coinbase (Crypto Spot)**

```json
{
  "plugins": {
    "coinbase": {
      "apiKey": "${COINBASE_API_KEY}",
      "apiSecret": "${COINBASE_API_SECRET}",
      "mode": "sandbox"
    }
  }
}
```

**Interactive Brokers (Stocks, Options, Futures)**

```json
{
  "plugins": {
    "ibkr": {
      "accountId": "${IBKR_ACCOUNT_ID}",
      "gatewayHost": "localhost:5000",
      "mode": "paper"
    }
  }
}
```

**Binance (Crypto Spot)**

```json
{
  "plugins": {
    "binance": {
      "apiKey": "${BINANCE_API_KEY}",
      "apiSecret": "${BINANCE_API_SECRET}",
      "mode": "testnet"
    }
  }
}
```

**Kraken (Crypto Spot + Margin)**

```json
{
  "plugins": {
    "kraken": {
      "apiKey": "${KRAKEN_API_KEY}",
      "apiSecret": "${KRAKEN_API_SECRET}"
    }
  }
}
```

**dYdX (Decentralized Perpetuals)**

```json
{
  "plugins": {
    "dydx": {
      "mnemonic": "${DYDX_MNEMONIC}",
      "mode": "testnet"
    }
  }
}
```

### Kill Switch

Instantly halt all trading:

```bash
tigerpaw trading kill               # Activate
tigerpaw trading resume             # Deactivate
```

The kill switch also auto-activates when daily loss limits or drawdown limits are breached.

### Audit Log

Every trade decision is logged to `~/.tigerpaw/trading/audit.jsonl` with tamper-evident HMAC-SHA256 chain linking. View trade history in the Trading Dashboard UI or export to CSV.

---

## Supported Channels

| Channel                             | Setup                   |
| ----------------------------------- | ----------------------- |
| Telegram                            | Bot token               |
| Discord                             | Bot + App tokens        |
| Slack                               | Bot + App tokens        |
| Signal                              | signal-cli daemon       |
| iMessage                            | macOS only              |
| Web                                 | Built-in                |
| WhatsApp                            | Browser-based extension |
| Matrix                              | Extension               |
| MS Teams                            | Extension               |
| IRC, Line, Nostr, Google Chat, etc. | Extensions              |

---

## Common CLI Commands

```bash
# Gateway
tigerpaw gateway run                # Start gateway
tigerpaw gateway status             # Check gateway status

# Channels
tigerpaw channels list              # List configured channels
tigerpaw channels status --probe    # Health check with RPC probe
tigerpaw channels add --interactive # Add channel wizard

# Configuration
tigerpaw config get                 # Show config
tigerpaw config set <key> <value>   # Set config value

# Diagnostics
tigerpaw doctor                     # Run health & security audit
tigerpaw doctor --fix               # Auto-repair issues
tigerpaw status --all               # Full system status

# Agents
tigerpaw agents list                # List agents
tigerpaw agents bind <id> <channel> # Bind agent to channel
```

---

## File Locations

```
~/.tigerpaw/
  tigerpaw.json          # Main configuration
  credentials/            # OAuth tokens
  sessions/               # Agent session logs
  trading/
    audit.jsonl           # Trade audit log
    policy-state.json     # Current risk state
```
