import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/imessage";

const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } =
  createPluginRuntimeStore<PluginRuntime>("iMessage runtime not initialized");
export { getIMessageRuntime, setIMessageRuntime };
