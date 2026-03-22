---
summary: "Uninstall Tigerpaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Tigerpaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `tigerpaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
tigerpaw uninstall
```

Non-interactive (automation / npx):

```bash
tigerpaw uninstall --all --yes --non-interactive
npx -y tigerpaw uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
tigerpaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
tigerpaw gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${OPENCLAW_STATE_DIR:-$HOME/.tigerpaw}"
```

If you set `OPENCLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.tigerpaw/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g tigerpaw
pnpm remove -g tigerpaw
bun remove -g tigerpaw
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Tigerpaw.app
```

Notes:

- If you used profiles (`--profile` / `OPENCLAW_PROFILE`), repeat step 3 for each state dir (defaults are `~/.tigerpaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `tigerpaw` is missing.

### macOS (launchd)

Default label is `ai.tigerpaw.gateway` (or `ai.tigerpaw.<profile>`; legacy `com.tigerpaw.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.tigerpaw.gateway
rm -f ~/Library/LaunchAgents/ai.tigerpaw.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.tigerpaw.<profile>`. Remove any legacy `com.tigerpaw.*` plists if present.

### Linux (systemd user unit)

Default unit name is `tigerpaw-gateway.service` (or `tigerpaw-gateway-<profile>.service`):

```bash
systemctl --user disable --now tigerpaw-gateway.service
rm -f ~/.config/systemd/user/tigerpaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Tigerpaw Gateway` (or `Tigerpaw Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Tigerpaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.tigerpaw\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.tigerpaw-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://tigerpaw.dev/install.sh` or `install.ps1`, the CLI was installed with `npm install -g tigerpaw@latest`.
Remove it with `npm rm -g tigerpaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `tigerpaw ...` / `bun run tigerpaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
