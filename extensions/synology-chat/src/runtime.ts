import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/synology-chat";

const { setRuntime: setSynologyRuntime, getRuntime: getSynologyRuntime } =
  createPluginRuntimeStore<PluginRuntime>(
    "Synology Chat runtime not initialized - plugin not registered",
  );
export { getSynologyRuntime, setSynologyRuntime };
