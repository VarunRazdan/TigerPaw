import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/signal";

const { setRuntime: setSignalRuntime, getRuntime: getSignalRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Signal runtime not initialized");
export { getSignalRuntime, setSignalRuntime };
