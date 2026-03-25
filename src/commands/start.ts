import fs from "node:fs";
import { CONFIG_PATH } from "../config/config.js";
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

export async function startCommand(opts: StartOptions = {}) {
  const configExisted = fs.existsSync(CONFIG_PATH);

  // Phase 1: Auto-setup if no config exists.
  if (!configExisted) {
    await setupCommand(undefined, defaultRuntime);
    console.log(`  ${green("✓")} Config ready ${dim(`(${CONFIG_PATH})`)}`);
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
