# OpenClaw: Installation & Runtime Summary

## Installation Options

| Method               | Command                                                         |
| -------------------- | --------------------------------------------------------------- |
| **Script (easiest)** | `curl -fsSL https://openclaw.ai/install.sh \| bash`             |
| **npm**              | `npm install -g openclaw@latest`                                |
| **Docker**           | `./docker-setup.sh`                                             |
| **From source**      | `pnpm install && pnpm build`                                    |
| **Cloud**            | Fly.io, Railway, Render, GCP, Hetzner (docs in `docs/install/`) |

After install, run the onboarding wizard once:

```bash
openclaw onboard --install-daemon
```

This configures your AI model/API key, channels, workspace, and installs the gateway as a macOS LaunchAgent or Linux systemd service.

---

## How It Runs

There are two core runtime components:

**1. The Gateway** — an always-on WebSocket control plane (`127.0.0.1:18789` by default) that:

- Maintains connections to all messaging channels (Telegram, Discord, WhatsApp, Slack, etc.)
- Routes incoming messages to agents
- Serves the web Control UI
- Manages sessions, cron jobs, webhooks, and tools

**2. The Agent (Pi RPC)** — invoked per-message or on demand:

```bash
openclaw agent --message "Write a checklist"
```

Runs one turn, uses tools (browser, bash, canvas, nodes), and delivers the reply back to the originating channel.

Config lives at `~/.openclaw/openclaw.json`. The gateway hot-reloads most changes without restart.

---

## Architecture

```
WhatsApp / Telegram / Slack / Discord / Signal / iMessage / ...
                         │
                    [ Gateway ]  ← always-on, port 18789
                    /    |    \
              Agent   WebChat   macOS/iOS/Android native apps
              (RPC)   Control UI
```

---

## Quick Start

```bash
# 1. Install
curl -fsSL https://openclaw.ai/install.sh | bash

# 2. Onboard (interactive setup)
openclaw onboard --install-daemon

# 3. Check status
openclaw gateway status

# 4. Open Control UI
openclaw dashboard

# 5. Run agent
openclaw agent --message "What can you do?"
```

---

## Pros

- **Unified multi-channel inbox** — one bot across 22+ messaging platforms simultaneously with a single config file
- **Local-first** — runs on your own machine; no vendor lock-in, your data stays yours
- **Rich tool ecosystem** — browser automation, bash execution, camera/screen on paired devices, cron, webhooks, skills
- **Security by default** — DM pairing requires explicit approval for unknown senders; Docker sandboxing for group/channel sessions
- **Flexible deployment** — runs on a Raspberry Pi, a VPS, macOS menu bar, or Docker; native apps for macOS/iOS/Android
- **Plugin architecture** — extensions install independently via npm, keeping core lean
- **Hot reload** — config changes apply without full restart in most cases
- **Model agnostic** — OpenAI, Anthropic, Bedrock, and many others supported

## Cons

- **Node 22+ hard requirement** — older systems need a runtime upgrade before anything works
- **Heavy initial setup** — onboarding touches model keys, gateway config, channel tokens, daemon install, workspace — lots of moving parts
- **Each channel needs its own credentials** — separate bot tokens for Telegram, Discord, Slack, etc.; WhatsApp requires a persistent browser session via Baileys (can break on WhatsApp updates)
- **Gateway must stay running** — if it crashes or the machine sleeps, you miss messages; requires daemon/VPS discipline
- **Schema-strict config** — any typo or unknown key in `openclaw.json` prevents startup; not forgiving for manual edits
- **iMessage requires BlueBubbles** — native iMessage support is legacy; the recommended path needs a separate BlueBubbles server running on a Mac
- **Monorepo complexity** — 77 `src/` subdirectories, 42 extension packages, native apps in Swift/Kotlin; large surface area for contributors
- **No TestFlight / no binary distribution for iOS** — mobile app must be built from source

---

**Bottom line:** OpenClaw is a powerful, self-hosted AI gateway for people who want a single bot brain reachable across every messaging platform they use. The setup cost is real but the payoff is a fully controllable, extensible system with no ongoing SaaS fees.
