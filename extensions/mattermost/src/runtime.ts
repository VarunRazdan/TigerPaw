import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/mattermost";

const { setRuntime: setMattermostRuntime, getRuntime: getMattermostRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Mattermost runtime not initialized");
export { getMattermostRuntime, setMattermostRuntime };
