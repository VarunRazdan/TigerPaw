# Tigerpaw - Getting Started Guide

Tigerpaw is a multi-channel AI gateway with real-money trading capabilities. It connects your AI agent to messaging platforms (Telegram, Discord, Slack, etc.) and trading platforms (Alpaca, Polymarket, Kalshi, Manifold).

---

## Why Local-First?

Tigerpaw runs entirely on your machine. This matters for trading:

- **Your API keys stay local** -- Exchange credentials are stored in `~/.tigerpaw/` with OS keychain integration (macOS Keychain, Linux secret-tool). They're never sent to a cloud service.
- **Your data stays local** -- Trade history, positions, and strategies never leave your disk.
- **The dashboard is local-only** -- Binds to `127.0.0.1:18789` by default. Not accessible from your network or the internet.
- **You control the kill switch** -- Auto-activates on limit breach. No cloud dependency to halt trading.
- **Institutional-grade risk controls** -- Every order passes through a 12-step validation pipeline. Daily spend caps, position limits, drawdown protection, and cooldown timers prevent the behavioral mistakes that wipe out 70-80% of retail traders.

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

### Approval Modes

- **Auto** -- Orders within limits execute immediately. Best for paper mode or aggressive tier.
- **Confirm** -- 15-second confirmation popup in the UI. Auto-approves on timeout. Configurable via `confirm.timeoutMs`.
- **Manual** -- Every trade requires explicit operator approval. Auto-denies after 5 minutes. Configurable via `manual.timeoutMs`.

### Pre-Trade Validation Pipeline

Every order passes through 12 sequential checks. The first failure denies the order. See the [README](README.md#pre-trade-validation-pipeline) for the full table.

Key checks: kill switch, numeric sanity, cooldown, balance/risk, per-trade size, daily loss, position concentration, max positions, max trades/day, daily spend, and consecutive losses.

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

### Trading Extensions

Configure the trading platform you want to use:

#### <img src="icons/trading-platforms/alpaca.svg" height="24" alt="Alpaca"> Alpaca (Stocks)

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

#### <img src="icons/trading-platforms/polymarket.svg" height="24" alt="Polymarket"> Polymarket (Prediction Markets)

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

#### <img src="icons/trading-platforms/kalshi.svg" height="24" alt="Kalshi"> Kalshi (Event Contracts)

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

#### <img src="icons/trading-platforms/manifold.svg" height="24" alt="Manifold"> Manifold (Play Money)

```json
{
  "plugins": {
    "manifold": {
      "apiKey": "${MANIFOLD_API_KEY}"
    }
  }
}
```

#### <img src="icons/trading-platforms/coinbase.svg" height="24" alt="Coinbase"> Coinbase (Crypto Spot)

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

#### <img src="icons/trading-platforms/interactive-brokers.svg" height="24" alt="Interactive Brokers"> Interactive Brokers (Stocks, Options, Futures)

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

#### <img src="icons/trading-platforms/binance.svg" height="24" alt="Binance"> Binance (Crypto Spot)

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

#### <img src="icons/trading-platforms/kraken.svg" height="24" alt="Kraken"> Kraken (Crypto Spot + Margin)

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

#### <img src="icons/trading-platforms/dydx.svg" height="24" alt="dYdX"> dYdX (Decentralized Perpetuals)

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
tigerpaw trading kill               # Activate (hard mode)
tigerpaw trading resume             # Deactivate
```

Two modes:

- **Hard** (default) -- Blocks ALL trading: buys, sells, and cancels all denied
- **Soft** -- Allows sells and cancels (position exit only); blocks new buys

Auto-activates when any of these thresholds are breached:

1. Daily loss >= `dailyLossLimitPercent`
2. Portfolio drawdown >= `maxPortfolioDrawdownPercent`
3. Consecutive losses >= `consecutiveLossPause`

### Audit Log

Every trade decision is logged to `~/.tigerpaw/trading/audit.jsonl` with HMAC-SHA256 chain linking for tamper evidence. The log rotates at 50 MB (configurable via `auditLog.maxFileSizeMb`) and keeps 5 archived files (configurable via `auditLog.rotateCount`). Each entry records the action, actor, order snapshot, policy snapshot, and a chain hash linking to the previous entry.

---

## Using the Control UI

After starting the gateway, open `http://localhost:18789` in your browser.

### Placing Trades via the UI

Each trading platform has a dedicated page with:

- **TradingView Chart** -- Live charts (collapsible) with the platform's default symbol
- **Order Entry Form** -- Select symbol, side (buy/sell), quantity, order type (market/limit/stop/stop_limit), and optional stop loss/take profit
- **Policy Pre-Check** -- Real-time validation showing which policy checks pass or fail before you submit
- **Confirmation Dialog** -- Review order details before execution

Orders submitted through the UI go through the same 12-step policy validation pipeline as orders from messaging channels or AI agents.

### Connecting Platforms

Click "Not Connected" on any platform badge or the Dashboard extensions grid to open the setup dialog. The dialog shows:

- Required credentials for each platform
- Step-by-step setup instructions
- A "Save to Config" button that writes credentials directly to `tigerpaw.json`
- A clipboard fallback if the gateway is not running

### Dashboard Auto-Open

```bash
tigerpaw dashboard              # Opens browser automatically
tigerpaw dashboard --no-open    # Just print the URL
```

The auto-open is platform-aware:

- **macOS**: Uses `open`
- **Linux**: Uses `xdg-open` (requires X11/Wayland)
- **WSL**: Uses `wslview`
- **SSH sessions**: Skipped automatically (prints URL instead)

---

## Notifications

Trading events appear as toast notifications in the dashboard. No configuration needed.

### Browser Notifications (Optional)

To receive desktop notifications when the dashboard tab is in the background:

1. Click the notification bell icon in the dashboard header
2. Enable "Browser Notifications"
3. Allow notifications when your browser prompts

Browser notifications are local-only -- they use the browser's Notification API and never send data to external services.

### Notification Events

| Event                 | When                                                    |
| --------------------- | ------------------------------------------------------- |
| Order Approved        | An order passed all 12 policy checks                    |
| Order Denied          | An order was blocked (shows which check failed)         |
| Order Pending         | Waiting for manual or confirm-mode approval             |
| Kill Switch Activated | Trading halted due to limit breach or manual activation |
| Limit Warning         | Daily spend or loss approaching 80% of configured limit |

---

## Advanced: Exposing the Dashboard

By default, Tigerpaw binds to `127.0.0.1` (localhost only). If you need to access it from another device on your network:

```bash
tigerpaw gateway run --bind lan --auth token --token "your-secret-token"
```

> **Warning**: This exposes the dashboard to your entire local network. Always use a strong auth token. For remote access, prefer SSH port forwarding:

```bash
ssh -L 18789:localhost:18789 your-server
# Then open http://localhost:18789 on your local machine
```

---

## Supported Channels

|                                                                     | Channel        | Setup                   |
| ------------------------------------------------------------------- | -------------- | ----------------------- |
| <img src="icons/messaging-channels/telegram.svg" height="20">       | Telegram       | Bot token               |
| <img src="icons/messaging-channels/discord.svg" height="20">        | Discord        | Bot + App tokens        |
| <img src="icons/messaging-channels/slack.svg" height="20">          | Slack          | Bot + App tokens        |
| <img src="icons/messaging-channels/signal.svg" height="20">         | Signal         | signal-cli daemon       |
| <img src="icons/messaging-channels/imessage.svg" height="20">       | iMessage       | macOS only              |
| <img src="icons/messaging-channels/whatsapp.svg" height="20">       | WhatsApp       | Browser-based extension |
| <img src="icons/messaging-channels/matrix.svg" height="20">         | Matrix         | Extension               |
| <img src="icons/messaging-channels/ms-teams.svg" height="20">       | MS Teams       | Extension               |
| <img src="icons/messaging-channels/irc.svg" height="20">            | IRC            | Extension               |
| <img src="icons/messaging-channels/line.svg" height="20">           | Line           | Extension               |
| <img src="icons/messaging-channels/nostr.svg" height="20">          | Nostr          | Extension               |
| <img src="icons/messaging-channels/google-chat.svg" height="20">    | Google Chat    | Extension               |
| <img src="icons/messaging-channels/mattermost.svg" height="20">     | Mattermost     | Extension               |
| <img src="icons/messaging-channels/twitch.svg" height="20">         | Twitch         | Extension               |
| <img src="icons/messaging-channels/feishu.svg" height="20">         | Feishu         | Extension               |
| <img src="icons/messaging-channels/zalo.svg" height="20">           | Zalo           | Extension               |
| <img src="icons/messaging-channels/tlon.svg" height="20">           | Tlon           | Extension               |
| <img src="icons/messaging-channels/synology-chat.svg" height="20">  | Synology Chat  | Extension               |
| <img src="icons/messaging-channels/nextcloud-talk.svg" height="20"> | Nextcloud Talk | Extension               |
| <img src="icons/messaging-channels/lobster.svg" height="20">        | Lobster        | Extension               |
| <img src="icons/messaging-channels/bluebubbles.svg" height="20">    | BlueBubbles    | Extension               |

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
