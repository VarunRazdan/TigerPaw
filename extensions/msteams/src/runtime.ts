import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/msteams";

const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } =
  createPluginRuntimeStore<PluginRuntime>("MSTeams runtime not initialized");
export { getMSTeamsRuntime, setMSTeamsRuntime };
