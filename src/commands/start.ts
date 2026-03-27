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
 * Prompt the user to choose an AI provider on first run.
 * Writes the selected provider into config.models.providers.
 */
async function promptLlmProvider(): Promise<void> {
  const { select, text, password, isCancel } = await import("@clack/prompts");

  const provider = await select({
    message: "Which AI provider will you use?",
    options: [
      { value: "anthropic", label: "Anthropic (Claude)", hint: "recommended" },
      { value: "openai", label: "OpenAI (GPT)" },
      { value: "ollama", label: "Ollama (local)", hint: "no API key needed" },
      { value: "skip", label: "I'll configure later" },
    ],
  });

  if (isCancel(provider) || provider === "skip") {
    return;
  }

  let cfg: OpenClawConfig = {};
  try {
    cfg = JSON5.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    // start fresh
  }

  if (provider === "ollama") {
    const baseUrl = await text({
      message: "Ollama base URL:",
      placeholder: "http://localhost:11434",
      defaultValue: "http://localhost:11434",
    });
    if (isCancel(baseUrl)) {
      return;
    }
    cfg.models = {
      ...cfg.models,
      providers: {
        ...cfg.models?.providers,
        ollama: { type: "ollama", baseUrl: baseUrl || "http://localhost:11434" },
      },
    };
  } else {
    const envHint = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    const apiKey = await password({
      message: `Enter your ${provider === "anthropic" ? "Anthropic" : "OpenAI"} API key:`,
      mask: "*",
    });
    if (isCancel(apiKey) || !apiKey) {
      console.log(dim(`  Tip: you can also set the ${envHint} environment variable.`));
      return;
    }
    const providerType = provider === "anthropic" ? "anthropic-messages" : "openai-completions";
    cfg.models = {
      ...cfg.models,
      providers: {
        ...cfg.models?.providers,
        [provider as string]: { type: providerType, apiKey: apiKey },
      },
    };
  }

  await writeConfigFile(cfg);
  console.log(`  ${green("✓")} AI provider configured: ${bold(provider as string)}`);
}

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

    // First-run only: interactive setup prompts
    if (process.stdin.isTTY) {
      try {
        await promptRemoteAccess();
      } catch {
        // Non-fatal — use defaults if prompt fails
      }

      // Prompt for AI provider if none configured yet
      try {
        let existingCfg: OpenClawConfig = {};
        try {
          existingCfg = JSON5.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        } catch {
          // ignore
        }
        const hasProviders =
          existingCfg.models?.providers && Object.keys(existingCfg.models.providers).length > 0;
        if (!hasProviders) {
          await promptLlmProvider();
        }
      } catch {
        // Non-fatal — user can configure later via dashboard
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
