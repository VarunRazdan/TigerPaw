import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/discord";

const { setRuntime: setDiscordRuntime, getRuntime: getDiscordRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Discord runtime not initialized");
export { getDiscordRuntime, setDiscordRuntime };
