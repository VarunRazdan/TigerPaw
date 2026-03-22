# Contributing to Tigerpaw

Thanks for your interest in contributing to Tigerpaw!

## Quick Links

- **GitHub:** https://github.com/varunrazdan/tigerpaw
- **Getting Started:** [`GETTING_STARTED.md`](GETTING_STARTED.md)

## How to Contribute

1. **Bugs & small fixes** — Open a PR
2. **New features / architecture** — Start a GitHub Discussion first
3. **New trading extensions** — Follow the pattern in `extensions/alpaca/`

## Getting Started

```bash
git clone https://github.com/varunrazdan/tigerpaw.git
cd tigerpaw
pnpm install
pnpm build
```

## Before You PR

- Run `pnpm build && pnpm check && pnpm test:fast`
- Keep PRs focused (one thing per PR)
- Describe what changed and why
- Include screenshots for UI changes

## Development Workflow

```bash
pnpm build          # Compile TypeScript
pnpm ui:build       # Build React UI
pnpm tsgo           # Type check
pnpm check          # Lint + format (oxlint + oxfmt)
pnpm format:fix     # Auto-fix formatting
pnpm test:fast      # Unit tests
pnpm test           # All tests
```

### Running Locally

```bash
pnpm gateway:dev
node tigerpaw.mjs doctor
node tigerpaw.mjs gateway run --dev --allow-unconfigured
```

## Creating a Trading Extension

Extensions live in `extensions/<name>/` and need 4 files:

1. **`tigerpaw.plugin.json`** — Manifest with permissions and config schema
2. **`package.json`** — Workspace package with `"tigerpaw": { "extensions": ["./index.ts"] }`
3. **`config.ts`** — Config type, validation, env var resolution
4. **`index.ts`** — Plugin with tools gated by `TradingPolicyEngine.evaluateOrder()`

See `extensions/alpaca/` for the reference implementation.

### Key Pattern: Policy-Gated Orders

Every order tool MUST call `evaluateOrder()` before execution, call `updatePolicyState()` after execution, and call `writeAuditEntry()` for every outcome.

## Code Style

- TypeScript ESM, strict typing, no `any`
- Formatting: oxlint + oxfmt (`pnpm check`)
- Tests: Vitest, colocated `*.test.ts`
- Files: aim for < 700 LOC
- Naming: **Tigerpaw** in UI, `tigerpaw` in code/config/paths
- Plugin dependencies go in the extension's `package.json`, not root

## Report a Vulnerability

See [`SECURITY.md`](SECURITY.md) for the vulnerability disclosure policy.
