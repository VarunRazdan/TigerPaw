import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/matrix";

const { setRuntime: setMatrixRuntime, getRuntime: getMatrixRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Matrix runtime not initialized");
export { getMatrixRuntime, setMatrixRuntime };
