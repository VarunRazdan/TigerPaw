import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/twitch";

const { setRuntime: setTwitchRuntime, getRuntime: getTwitchRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Twitch runtime not initialized");
export { getTwitchRuntime, setTwitchRuntime };
