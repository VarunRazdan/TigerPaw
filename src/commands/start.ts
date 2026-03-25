import fs from "node:fs";
import JSON5 from "json5";
import { CONFIG_PATH } from "../config/config.js";
import { type OpenClawConfig, writeConfigFile } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { setupCommand } from "./setup.js";

type StartOptions = {
  port?: number;
  noOpen?: boolean;
  verbose?: boolean;
};

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

/**
 * Prompt the user to choose how they want to access the dashboard.
 * Only shown on first run with an interactive TTY.
 */
async function promptRemoteAccess(): Promise<void> {
  const { select, isCancel } = await import("@clack/prompts");

  const accessMode = await select({
    message: "How will you access the dashboard?",
    options: [
      { value: "local", label: "This machine only", hint: "default — most secure" },
      { value: "tailscale", label: "From my devices via Tailscale", hint: "end-to-end encrypted" },
      {
        value: "cloudflare",
        label: "From anywhere via Cloudflare Tunnel",
        hint: "easiest setup",
      },
    ],
  });

  if (isCancel(accessMode) || accessMode === "local") {
    return; // Keep defaults
  }

  // Read the config that setupCommand just wrote
  let cfg: OpenClawConfig = {};
  try {
    cfg = JSON5.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    // If read fails, start fresh — setupCommand already wrote it
  }

  if (accessMode === "tailscale") {
    cfg.gateway = {
      ...cfg.gateway,
      bind: "tailnet",
      tailscale: { ...cfg.gateway?.tailscale, mode: "serve" },
      auth: { ...cfg.gateway?.auth, mode: "token" },
    };
    await writeConfigFile(cfg);
    console.log(`  ${green("✓")} Configured for Tailscale access`);
    console.log(
      dim("    Install Tailscale on this machine and your client devices, then sign in."),
    );
  } else if (accessMode === "cloudflare") {
    cfg.gateway = {
      ...cfg.gateway,
      auth: { ...cfg.gateway?.auth, mode: "token" },
    };
    await writeConfigFile(cfg);
    console.log(`  ${green("✓")} Configured for Cloudflare Tunnel access`);
    console.log("");
    console.log(dim("    To complete setup:"));
    console.log(
      dim(
        "    1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
      ),
    );
    console.log(dim("    2. Run: cloudflared tunnel --url http://localhost:18789"));
    console.log(
      dim(
        "    3. Add the tunnel URL: tigerpaw config set gateway.controlUi.allowedOrigins '[\"https://your-tunnel-url\"]'",
      ),
    );
    console.log("");
  }
}

export async function startCommand(opts: StartOptions = {}) {
  const configExisted = fs.existsSync(CONFIG_PATH);

  // Phase 1: Auto-setup if no config exists.
  if (!configExisted) {
    await setupCommand(undefined, defaultRuntime);
    console.log(`  ${green("✓")} Config ready ${dim(`(${CONFIG_PATH})`)}`);

    // First-run only: ask how they want to access the dashboard
    if (process.stdin.isTTY) {
      try {
        await promptRemoteAccess();
      } catch {
        // Non-fatal — use defaults if prompt fails
      }
    }
  }

  // Phase 2+3: Start gateway with browser open (unless --no-open).
  const { runGatewayCommand } = await import("../cli/gateway-cli/run.js");
  await runGatewayCommand({
    port: opts.port,
    allowUnconfigured: true,
    verbose: opts.verbose,
    open: !opts.noOpen,
    onReady: async () => {
      const resolvedPort = opts.port ?? 18789;
      console.log(
        `  ${green("✓")} Gateway listening on ${bold(`http://localhost:${resolvedPort}`)}`,
      );
      console.log("");
      console.log(`  ${dim("Paper mode active — no real money at risk.")}`);
      console.log(
        `  ${dim('Connect a trading platform: click any "Not Connected" badge in the dashboard.')}`,
      );
      console.log("");
      if (!opts.noOpen) {
        const { dashboardCommand } = await import("./dashboard.js");
        await dashboardCommand(defaultRuntime);
      }
    },
  });
}
