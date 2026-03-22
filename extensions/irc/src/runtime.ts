import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/irc";

const { setRuntime: setIrcRuntime, getRuntime: getIrcRuntime } =
  createPluginRuntimeStore<PluginRuntime>("IRC runtime not initialized");
export { getIrcRuntime, setIrcRuntime };
