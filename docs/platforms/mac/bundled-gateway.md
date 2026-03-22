---
summary: "Gateway runtime on macOS (external launchd service)"
read_when:
  - Packaging Tigerpaw.app
  - Debugging the macOS gateway launchd service
  - Installing the gateway CLI for macOS
title: "Gateway on macOS"
---

# Gateway on macOS (external launchd)

Tigerpaw.app no longer bundles Node/Bun or the Gateway runtime. The macOS app
expects an **external** `tigerpaw` CLI install, does not spawn the Gateway as a
child process, and manages a per‑user launchd service to keep the Gateway
running (or attaches to an existing local Gateway if one is already running).

## Install the CLI (required for local mode)

You need Node 22+ on the Mac, then install `tigerpaw` globally:

```bash
npm install -g tigerpaw@<version>
```

The macOS app’s **Install CLI** button runs the same flow via npm/pnpm (bun not recommended for Gateway runtime).

## Launchd (Gateway as LaunchAgent)

Label:

- `ai.tigerpaw.gateway` (or `ai.tigerpaw.<profile>`; legacy `com.tigerpaw.*` may remain)

Plist location (per‑user):

- `~/Library/LaunchAgents/ai.tigerpaw.gateway.plist`
  (or `~/Library/LaunchAgents/ai.tigerpaw.<profile>.plist`)

Manager:

- The macOS app owns LaunchAgent install/update in Local mode.
- The CLI can also install it: `tigerpaw gateway install`.

Behavior:

- “Tigerpaw Active” enables/disables the LaunchAgent.
- App quit does **not** stop the gateway (launchd keeps it alive).
- If a Gateway is already running on the configured port, the app attaches to
  it instead of starting a new one.

Logging:

- launchd stdout/err: `/tmp/tigerpaw/tigerpaw-gateway.log`

## Version compatibility

The macOS app checks the gateway version against its own version. If they’re
incompatible, update the global CLI to match the app version.

## Smoke check

```bash
tigerpaw --version

OPENCLAW_SKIP_CHANNELS=1 \
OPENCLAW_SKIP_CANVAS_HOST=1 \
tigerpaw gateway --port 18999 --bind loopback
```

Then:

```bash
tigerpaw gateway call health --url ws://127.0.0.1:18999 --timeout 3000
```
