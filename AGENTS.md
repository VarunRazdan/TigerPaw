# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tigerpaw** is a multi-channel AI trading gateway forked from OpenClaw. It connects AI agents to messaging platforms (Telegram, Discord, Slack, Signal, iMessage, etc.) and real-money trading platforms (Alpaca, Polymarket, Kalshi, Manifold).

- Repo: https://github.com/varunrazdan/tigerpaw
- Package name: `tigerpaw`
- CLI binaries: `tigerpaw` (primary), `openclaw` (legacy alias)
- Config dir: `~/.tigerpaw/` (legacy: `~/.openclaw/`)
- Config file: `tigerpaw.json` (legacy: `openclaw.json`)

## Build, Test, and Development

- **Runtime**: Node.js 22+
- **Package manager**: pnpm 10+
- **Install deps**: `pnpm install`
- **Build**: `pnpm build` (compiles to `dist/`)
- **Build UI**: `pnpm ui:build` (React control UI)
- **Type check**: `pnpm tsgo`
- **Lint/format**: `pnpm check` (oxlint + oxfmt)
- **Format fix**: `pnpm format:fix`
- **Unit tests**: `pnpm test:fast` (vitest, excludes integration dirs)
- **All tests**: `pnpm test`
- **Trading tests**: `npx vitest run src/trading/`
- **Single test**: `npx vitest run path/to/file.test.ts`
- **Coverage**: `pnpm test:coverage` (70% threshold)
- **Dev CLI**: `pnpm tigerpaw ...` or `node tigerpaw.mjs ...`
- **Dev gateway**: `pnpm gateway:dev`
- **Prepack** (auto on `npm pack`/`npm publish`): runs `pnpm build && pnpm ui:build`

## Project Structure

```
src/                    # Core source (TypeScript ESM)
  cli/                  # CLI wiring
  commands/             # CLI commands (gateway, config, doctor, channels, etc.)
  config/               # Config loading, paths, types, validation
  trading/              # Trading policy engine, audit log, kill switch, state
  security/             # Security audit, credential checks
  secrets/              # SecretRef resolution, keychain integration
  gateway/              # WebSocket gateway server, HTTP, CORS, rate limiting
  infra/                # Runtime infra (paths, env, exec)
  plugins/              # Plugin/extension loading, manifests, permissions
  compat/               # Legacy name support (openclaw -> tigerpaw migration)
  logging/              # Subsystem logger, log redaction
  agents/               # Agent runtime, tools, sandbox
  telegram/             # Telegram channel
  discord/              # Discord channel
  slack/                # Slack channel
  signal/               # Signal channel
  imessage/             # iMessage channel
  web/                  # WhatsApp Web channel
extensions/             # Extension packages (workspace packages)
  alpaca/               # Alpaca stock trading
  polymarket/           # Polymarket prediction markets
  kalshi/               # Kalshi event contracts
  manifold/             # Manifold play-money markets
  coinbase/             # Coinbase Advanced Trade (crypto)
  ibkr/                 # Interactive Brokers (stocks, options, futures)
  binance/              # Binance (crypto spot)
  kraken/               # Kraken (crypto spot + margin)
  dydx/                 # dYdX v4 (decentralized perpetuals)
  memory-lancedb/       # Vector memory (reference extension pattern)
  msteams/              # MS Teams
  matrix/               # Matrix
  ... (40+ extensions)
ui/                     # React 19 + Tailwind 4 + shadcn control UI
  src/pages/            # TradingPage, SecurityPage, etc.
  src/components/       # KillSwitchButton, RiskOverviewPanel, etc.
apps/                   # Native apps (macOS, iOS, Android)
docs/                   # Documentation (Mintlify)
scripts/                # Build scripts, release tools
test/                   # Integration test helpers
dist/                   # Build output (gitignored)
```

## Trading Infrastructure

The trading subsystem is in `src/trading/`:

- **`policy-engine.ts`** — Core validation pipeline (10 pre-trade checks), 3 approval modes (auto/confirm/manual), 3 risk tier presets (conservative/moderate/aggressive)
- **`audit-log.ts`** — Tamper-evident JSONL with HMAC-SHA256 chain linking, rotation at 50MB
- **`kill-switch.ts`** — Instant trading halt, auto-activates on limit breach
- **`policy-state.ts`** — Persisted state (daily P&L, trade count, positions), daily reset at UTC midnight
- **`config.ts`** — Trading config schema, validation (live mode enforces finite limits)

All trading tools are **policy-gated**: every order goes through `TradingPolicyEngine.evaluateOrder()` before execution.

### Fail-Safe Trading Pattern

- Extensions MUST check `api.tradingPolicyConfig` and block orders with a hard error if missing
- Extensions MUST NOT use `as unknown as` casts to access trading config — use the typed field on `OpenClawPluginApi` (legacy name for the Tigerpaw plugin API type)
- Order placement tools must have `if (!policyEngine) { return error; }` before any order execution
- API secrets must never be sent as plaintext headers — use HMAC or RSA request signing

## Key Patterns

### Legacy Compatibility

The rename from OpenClaw to Tigerpaw maintains backward compatibility:

- `src/compat/legacy-names.ts` — defines `LEGACY_PROJECT_NAMES`, `LEGACY_MANIFEST_KEYS`, etc.
- `src/config/paths.ts` — `resolveStateDir()` checks `TIGERPAW_STATE_DIR` -> `OPENCLAW_STATE_DIR` -> filesystem
- `src/plugins/manifest.ts` — loads both `tigerpaw.plugin.json` and `openclaw.plugin.json`
- Tests use `OPENCLAW_STATE_DIR` and `.openclaw` dirs (do NOT change test helpers to `.tigerpaw`)

### Extension Plugin Structure

Extensions follow the pattern in `extensions/memory-lancedb/`:

- `tigerpaw.plugin.json` — manifest with name, version, permissions
- `src/index.ts` — exports `createPlugin()` factory
- Each trading extension registers tools gated by the policy engine

### SecretRef System

Credentials use `SecretRef` (never plaintext in config):

- `src/config/types.secrets.ts` — type definitions
- `src/secrets/resolve.ts` — resolution from env/file/exec/keychain
- `src/secrets/keychain.ts` — macOS Keychain + Linux secret-tool + AES-256-GCM fallback

### Config Types

- `src/config/types.gateway.ts` — gateway config
- `src/config/types.tigerpaw.ts` — root config type
- `src/trading/config.ts` — trading-specific config

## Coding Style

- TypeScript ESM, strict typing, avoid `any`
- Formatting: oxlint + oxfmt (`pnpm check`)
- Tests: Vitest, colocated `*.test.ts`, V8 coverage 70% threshold
- Files: aim for <700 LOC, split when needed
- Naming: **Tigerpaw** for product/UI, `tigerpaw` for CLI/package/paths/config
- Keep `openclaw` in legacy compat code only
- Plugin deps go in extension `package.json`, not root

## Environment Variables

### Runtime

- `TIGERPAW_STATE_DIR` — state directory override
- `TIGERPAW_GATEWAY_PORT` — gateway port
- `TIGERPAW_GATEWAY_TOKEN` — gateway auth token
- Legacy: `OPENCLAW_STATE_DIR`, `OPENCLAW_GATEWAY_TOKEN` (still checked as fallback)

### Testing

- `OPENCLAW_TEST_FAST=1` — set by global test setup
- `OPENCLAW_TEST_PROFILE=low` — low-memory test profile
- Do NOT change `src/test-utils/temp-home.ts` to use `.tigerpaw` — many tests depend on `.openclaw`

## Important Caveats

- The `prepack` hook runs `pnpm build && pnpm ui:build` automatically before `npm pack`/`publish`
- The `files` array in `package.json` controls what's in the npm tarball
- The gateway serves the Control UI at the configured port (default 18789)
- Trading in `paper` mode defaults approval to `auto`; `live` mode requires finite risk limits
- Kill switch auto-activates when daily loss, drawdown, or consecutive loss limits are breached
- Every trade decision is logged to `~/.tigerpaw/trading/audit.jsonl`

## File Locations

| Purpose         | Path                                        |
| --------------- | ------------------------------------------- |
| Config          | `~/.tigerpaw/tigerpaw.json`                 |
| Credentials     | `~/.tigerpaw/credentials/`                  |
| Trade audit log | `~/.tigerpaw/trading/audit.jsonl`           |
| Policy state    | `~/.tigerpaw/trading/policy-state.json`     |
| Sessions        | `~/.tigerpaw/sessions/`                     |
| Legacy config   | `~/.openclaw/openclaw.json` (auto-migrated) |
