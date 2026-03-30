# Tigerpaw - Getting Started Guide

Tigerpaw is everything [OpenClaw](https://github.com/openclaw/openclaw) does -- 40+ messaging channels, AI agent runtime, plugin system -- plus a trading engine, security hardening, a modern React 19 dashboard, and real-time notifications. Now with an AI assistant, visual workflow builder, MCP protocol support, local LLM integration, and i18n in 10 languages. Whether you're building AI-powered messaging bots, trading bots, or both, Tigerpaw does it all from one install.

---

## What You Get

**For everyone (even if you don't trade):**

- 40+ messaging channel integrations (Telegram, Discord, Slack, Signal, iMessage, WhatsApp, Matrix, MS Teams, IRC, Line, Nostr, Google Chat, and more)
- Modern React 19 dashboard -- replaces OpenClaw's older Lit/Web Components UI
- Gateway security hardening -- CORS allowlisting, per-IP rate limiting, request size enforcement, credential rotation tracking
- Zero-config start -- `tigerpaw start` creates config, starts the gateway, opens the dashboard
- Docker multi-arch images (amd64 + arm64) with rootless Podman/systemd support
- Plugin permission manifests with security audit via `tigerpaw doctor`
- Local-first by default -- gateway binds to localhost, data stays on your machine
- AI assistant (Jarvis) -- tasks, reminders, daily briefings, and knowledge retrieval
- Message Hub -- unified inbox across all messaging channels with search, filtering, and date grouping
- Visual workflow builder for event-driven automation (trading events, cron schedules, message routing)
- MCP protocol support -- connect external tool servers and expose Tigerpaw tools to other AI agents
- Local LLM support (Ollama, LM Studio) with auto-detection and cloud fallback
- i18n in 10 languages (English, Spanish, French, German, Japanese, Korean, Chinese Simplified + Traditional, Portuguese, Arabic)

**For traders:**

- 9 exchange integrations (Alpaca, Polymarket, Kalshi, Manifold, Coinbase, Interactive Brokers, Binance, Kraken, dYdX)
- 12-step pre-trade validation pipeline -- every order checked before execution
- 3 risk tiers (conservative / moderate / aggressive) with daily spend caps, position limits, drawdown protection
- Kill switch with auto-activation on limit breach
- HMAC-SHA256 tamper-evident audit log for every trade decision
- Real-time trading notifications (in-app toasts + optional browser alerts)
- 8 trading bot commands accessible from any messaging channel

> **Don't trade?** Skip the [Trading Setup](#trading-setup) section entirely. Tigerpaw works as a fully featured messaging gateway without configuring any trading platforms.

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
# Tigerpaw 2026.x.x
```

> **Upgrading from OpenClaw?** Tigerpaw automatically detects and uses your
> existing `~/.openclaw/` config. The `openclaw` CLI command still works as
> an alias. No migration steps needed.

---

## Quick Start

```bash
tigerpaw start
```

That's it. `tigerpaw start` does three things:

1. **Creates config** — Writes `~/.tigerpaw/tigerpaw.json` with safe defaults (paper mode, localhost, conservative risk tier) if it doesn't exist
2. **Starts the gateway** — Binds to `http://localhost:18789` (localhost only)
3. **Opens the dashboard** — Auto-opens the Control UI in your default browser

Paper mode is active by default — no real money at risk. Connect a trading platform by clicking any "Not Connected" badge in the dashboard.

### Manual Setup (Advanced)

If you prefer step-by-step control:

```bash
tigerpaw setup                      # Create config + workspace
tigerpaw gateway run --open         # Start gateway + open browser
tigerpaw doctor                     # Verify everything works
```

### What `tigerpaw start` Does

| Step    | What Happens                                                         |
| ------- | -------------------------------------------------------------------- |
| Config  | Creates `~/.tigerpaw/tigerpaw.json` with `gateway.mode: "local"`     |
| Auth    | Auto-generates a gateway auth token (persisted to config)            |
| Gateway | Starts on `http://localhost:18789` (not reachable from your network) |
| Browser | Opens the Control UI in your default browser                         |
| SSH     | Detects SSH sessions and prints the URL instead of opening a browser |

The **Control UI** (React dashboard) is served at `http://localhost:18789/`.

### 2. Configure Your AI Provider

Tigerpaw needs an AI model to power messaging bots and the assistant. On first run, `tigerpaw start` prompts you to choose a provider. You can also configure it manually:

**Option A: Anthropic (Claude) — recommended**

```bash
# Set via environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Or write to config
tigerpaw config set models.providers.anthropic.type anthropic-messages
tigerpaw config set models.providers.anthropic.apiKey "sk-ant-..."
```

**Option B: OpenAI (GPT)**

```bash
export OPENAI_API_KEY="sk-..."

# Or write to config
tigerpaw config set models.providers.openai.type openai-completions
tigerpaw config set models.providers.openai.apiKey "sk-..."
```

**Option C: Ollama (local — no API key needed)**

```bash
# 1. Install and start Ollama
ollama serve

# 2. Pull a model
ollama pull llama3.2

# 3. Configure Tigerpaw to use it
tigerpaw config set models.providers.ollama.type ollama
tigerpaw config set models.providers.ollama.baseUrl "http://localhost:11434"
```

You can also configure providers from the dashboard: navigate to **Models** in the sidebar and click **Configure Provider**.

### 3. Add a Messaging Channel

```bash
# Add a channel directly
tigerpaw channels add --channel telegram --token "123456:ABC-your-bot-token"
tigerpaw channels add --channel discord --bot-token "..." --app-token "..."
```

### 4. Check Status

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
| `policy.confirm.timeoutAction`       | `"approve"` / `"deny"`                                        | `"deny"`         | What happens when confirm times out             |
| `policy.confirm.showNotification`    | `boolean`                                                     | `true`           | Show UI notification for confirm requests       |
| `policy.manual.timeoutMs`            | `number`                                                      | `300000`         | Manual approval timeout (ms)                    |
| `policy.manual.timeoutAction`        | `"approve"` / `"deny"`                                        | `"deny"`         | What happens when manual approval times out     |
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
| Approval Mode          | Manual       | Confirm (30s) | Auto       |
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
- **Confirm** -- Confirmation popup in the UI. Configurable timeout (default 30s for moderate, 15s for others) and timeout action (`"deny"` by default). Set via `confirm.timeoutMs` and `confirm.timeoutAction`.
- **Manual** -- Every trade requires explicit operator approval. Configurable timeout (default 5 minutes) and timeout action (`"deny"` by default). Set via `manual.timeoutMs` and `manual.timeoutAction`.

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

Get API keys: [Alpaca Dashboard → API Keys](https://app.alpaca.markets/brokerage/account/api-keys)

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

Get API keys: [Polymarket](https://polymarket.com/) → Account Settings → API Access

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

Get API keys: [Kalshi API Docs](https://docs.kalshi.com/)

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

Get API key: [Manifold API Docs](https://docs.manifold.markets/api) → Profile Settings

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

Get API keys: [Coinbase Developer Platform](https://coinbase.com/developer-platform)

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

Get started: [Interactive Brokers](https://www.interactivebrokers.com/) → Download Client Portal Gateway

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

Get API keys: [Binance API Management](https://www.binance.com/en/account/api-management)

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

Get API keys: [Kraken API Docs](https://docs.kraken.com/api/docs/guides/global-intro)

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

Get started: [dYdX](https://dydx.trade/) → Export your Cosmos wallet mnemonic

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

Instantly halt all trading via the dashboard UI (kill switch button) or from any messaging channel:

```
"Stop all trading" → AI calls trading_killswitch_activate
"Resume trading"   → AI calls trading_killswitch_deactivate
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

### Connecting Email & Calendar

Navigate to the **Integrations** page from the sidebar. You'll see cards for each supported provider:

- **Email**: Gmail, Outlook
- **Calendar**: Google Calendar, Outlook Calendar
- **Meetings**: Zoom, Google Meet, Microsoft Teams

**Setup:**

1. **Set OAuth credentials** — Each provider requires a Client ID and Client Secret. Set them as environment variables:

   ```bash
   # Google (Gmail, Calendar, Meet)
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"

   # Microsoft (Outlook, Calendar, Teams)
   export MICROSOFT_CLIENT_ID="your-client-id"
   export MICROSOFT_CLIENT_SECRET="your-client-secret"

   # Zoom
   export ZOOM_CLIENT_ID="your-client-id"
   export ZOOM_CLIENT_SECRET="your-client-secret"
   ```

2. **Click "Connect"** — Your browser opens the provider's consent screen. After approving, you're redirected back to Tigerpaw and the connection is established.

3. **Use via Jarvis** — Once connected, Jarvis can read emails, create calendar events, and schedule meetings. Try: "Jarvis, summarize my unread emails" or "Jarvis, what's on my calendar today?"

4. **Use in Workflows** — Three new workflow action nodes are available: `Send Email`, `Create Calendar Event`, and `Schedule Meeting`. These use your connected providers automatically.

**Security:** OAuth tokens are encrypted at rest using AES-256-GCM via the credential vault. Tokens auto-refresh before expiry. All API calls run locally — your data never passes through Tigerpaw's servers.

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

### Using the Assistant

The **Assistant** page is accessible from the sidebar under Overview. It provides a personal AI assistant powered by your configured LLM provider.

**Assistant**: Tigerpaw's AI assistant is named **Jarvis**.

**Capabilities**:

- **Tasks** -- Create, list, and complete tasks with priority levels (urgent, high, medium, low)
- **Reminders** -- Set time-based reminders that trigger notifications
- **Daily Briefing** -- Generate an AI-powered summary of your portfolio, recent trades, and channel activity
- **Knowledge Retrieval** -- Search your assistant's memory for past conversations and context

The assistant connects directly to the gateway agent runtime -- all tool calls are real, not demo data.

### Workflows

The **Workflows** page lets you build event-driven automations with a visual drag-and-drop editor.

**Getting started**:

1. Navigate to **Workflows** in the sidebar
2. Choose a template or create from scratch:
   - **Trading Alert** -- Send Discord alerts when trades are denied
   - **Message Router** -- Route urgent messages from any channel to Slack
   - **Daily Digest** -- Generate an LLM summary and send via Telegram at a scheduled time
3. Click a workflow to open the visual editor

**Node types**:

- **Triggers** -- Message received, cron schedule, trading event, webhook, manual
- **Conditions** -- Keyword match, sender filter, time window, channel filter
- **Actions** -- Send message, invoke tool, call webhook, run LLM task
- **Transforms** -- Format data, extract fields, aggregate

### MCP Integration

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) lets AI agents discover and use tools from external servers.

**Connecting to external MCP servers**:

1. Navigate to **MCP** in the sidebar
2. Click "Add Server" and choose a transport:
   - **stdio** -- Run a local command (e.g., `npx @modelcontextprotocol/server-github`)
   - **SSE** -- Connect to a remote server via HTTP Server-Sent Events
3. Once connected, the server's tools appear in the tool list and are available to your AI agent

**Exposing Tigerpaw as an MCP server**: Toggle "Expose as MCP Server" to let external AI agents (Claude Desktop, Cursor, etc.) discover and use Tigerpaw's tools -- including trading commands, channel messaging, and workflow triggers.

### AI Models

The **Models** page manages your LLM providers and local model installations.

**Provider auto-detection**: Tigerpaw automatically detects running Ollama and LM Studio instances on your machine.

**Model management**:

- View installed models with metadata (size, parameters, quantization)
- Pull new models from Ollama's registry
- Set a default model for the AI agent
- Monitor provider health and connection status

**Cloud fallback**: When local models are unavailable, Tigerpaw falls back to configured cloud providers (Anthropic, OpenAI). Configure providers during `tigerpaw start` or in the Models page.

---

## Notifications

Trading events appear as toast notifications in the dashboard. No configuration needed.

### Browser Notifications (Optional)

To receive desktop notifications when the dashboard tab is in the background:

1. Click the notification bell icon in the dashboard header
2. Enable "Browser Notifications"
3. Allow notifications when your browser prompts

Browser notifications are local-only -- they use the browser's Notification API and never send data to external services.

### Per-Platform Filtering

Go to **Settings > Notifications > Notify by Platform** to toggle notifications per trading platform. For example, you can enable notifications for Polymarket only and disable all others. Global events (kill switch, limit warnings) are always shown.

### Notification Events

| Event                 | When                                                    |
| --------------------- | ------------------------------------------------------- |
| Order Approved        | An order passed all 12 policy checks                    |
| Order Denied          | An order was blocked (shows which check failed)         |
| Order Pending         | Waiting for manual or confirm-mode approval             |
| Kill Switch Activated | Trading halted due to limit breach or manual activation |
| Limit Warning         | Daily spend or loss approaching 80% of configured limit |

### Proactive Channel Notifications

Push trading alerts to any messaging channel (Telegram, Discord, Slack, etc.) by adding notification targets to your config:

```json
{
  "trading": {
    "notifications": {
      "enabled": true,
      "targets": [
        { "channel": "telegram", "to": "YOUR_CHAT_ID" },
        {
          "channel": "discord",
          "to": "YOUR_CHANNEL_ID",
          "events": ["trading.order.denied", "trading.killswitch.activated"]
        }
      ]
    }
  }
}
```

| Field       | Type        | Description                                                         |
| ----------- | ----------- | ------------------------------------------------------------------- |
| `channel`   | `string`    | Messaging platform (`telegram`, `discord`, `slack`, `signal`, etc.) |
| `to`        | `string`    | Chat/channel/user ID on the platform                                |
| `accountId` | `string?`   | For multi-account channels (optional)                               |
| `threadId`  | `string?`   | For threaded channels (optional)                                    |
| `events`    | `string[]?` | Filter events (omit to receive all)                                 |

The channel must already be configured and connected. Notifications are delivered best-effort -- a failed delivery does not block trading.

---

## Remote Dashboard Access

By default, the dashboard binds to `localhost:18789` and is only accessible on the machine running Tigerpaw. Most users running Tigerpaw on a headless server interact via messaging channels -- but sometimes you need the full dashboard from your phone or laptop.

### Option 1: Tailscale (Recommended)

End-to-end encrypted via WireGuard. Not even Tailscale's relay servers can decrypt your traffic.

**Requirement:** Install Tailscale on both the server AND every device you want to access the dashboard from.

```bash
# 1. Install Tailscale on the server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# 2. Install Tailscale on your phone/laptop and sign in to the same network

# 3. Configure Tigerpaw
tigerpaw config set gateway.bind tailnet
tigerpaw config set gateway.tailscale.mode serve
tigerpaw config set gateway.auth.mode token

# 4. Restart the gateway
tigerpaw gateway run
```

Open `http://<tailscale-ip>:18789` from any device on your Tailnet.

### Option 2: Cloudflare Tunnel

Free public HTTPS. Only requires `cloudflared` on the server -- nothing to install on client devices.

> **Note:** Cloudflare terminates TLS at their edge, meaning they can technically see your dashboard traffic in transit. Your API keys are never sent to the dashboard, so they remain safe.

```bash
# 1. Install cloudflared on the server
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# 2. Start a quick tunnel
cloudflared tunnel --url http://localhost:18789
# Outputs: https://random-name.cfargotunnel.com

# 3. Add the tunnel URL to your config
tigerpaw config set gateway.controlUi.allowedOrigins '["https://random-name.cfargotunnel.com"]'
tigerpaw config set gateway.auth.mode token

# 4. Restart the gateway
tigerpaw gateway run
```

### Option 3: SSH Port Forwarding

No additional software needed. Works from any device with SSH access to the server.

```bash
ssh -L 18789:localhost:18789 your-server
# Then open http://localhost:18789 on your local machine
```

### Comparison

| Method                | Encryption                | Install on client? | Persistent URL?    | Best for                        |
| --------------------- | ------------------------- | ------------------ | ------------------ | ------------------------------- |
| **Tailscale**         | End-to-end (WireGuard)    | Yes                | Yes (Tailscale IP) | Privacy-sensitive, multi-device |
| **Cloudflare Tunnel** | TLS (CF decrypts at edge) | No                 | Yes (tunnel URL)   | Easy access from anywhere       |
| **SSH tunnel**        | SSH                       | No (if SSH exists) | No (per-session)   | Quick one-off access            |

### What stays local regardless of access mode

- API keys and exchange credentials (stored in `~/.tigerpaw/`, never sent to dashboard)
- Trade execution (orders placed from the server, not the browser)
- Audit logs and trade records
- Kill switch state changes (UI sends commands to localhost gateway)

### Trading Bot Commands

If you mainly interact via messaging channels, the `trading-commands` extension gives you trading data without needing the dashboard at all:

| Ask your AI agent...        | Tool invoked                  |
| --------------------------- | ----------------------------- |
| "What's my portfolio?"      | `trading_portfolio_summary`   |
| "How's my P&L today?"       | `trading_daily_metrics`       |
| "Show my positions"         | `trading_positions`           |
| "Stop all trading"          | `trading_killswitch_activate` |
| "Am I close to any limits?" | `trading_risk_status`         |
| "Show recent trades"        | `trading_recent_trades`       |

These work from Telegram, Discord, Slack, or any connected channel -- no dashboard access needed.

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
tigerpaw channels add --channel telegram --token "..." # Add channel

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
  tigerpaw.json          # Main configuration (JSON5, editable)
  tigerpaw.db            # SQLite database (workflows, credentials, audit log, state)
  sessions/               # Agent session logs
```

**Backup:** Copy `tigerpaw.db` while the server is stopped. This single file contains all workflows, encrypted credentials, execution history, and trading state.

**Upgrading from flat files:** On first startup after upgrade, Tigerpaw automatically migrates data from `credentials/`, `workflows/`, and `trading/` directories into `tigerpaw.db`. Original files are renamed with `.pre-sqlite-backup` suffix.
