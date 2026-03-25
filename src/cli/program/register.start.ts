import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerStartCommand(program: Command) {
  program
    .command("start")
    .description("Start Tigerpaw — creates config if needed, starts gateway, opens dashboard")
    .option("--port <port>", "Gateway port (default: 18789)")
    .option("--no-open", "Start gateway without opening browser")
    .option("--verbose", "Verbose logging", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { startCommand } = await import("../../commands/start.js");
        await startCommand({
          port: opts.port,
          noOpen: opts.open === false,
          verbose: Boolean(opts.verbose),
        });
      });
    });
}
