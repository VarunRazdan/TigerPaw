import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/slack";

const { setRuntime: setSlackRuntime, getRuntime: getSlackRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Slack runtime not initialized");
export { getSlackRuntime, setSlackRuntime };
