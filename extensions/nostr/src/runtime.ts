import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/nostr";

const { setRuntime: setNostrRuntime, getRuntime: getNostrRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Nostr runtime not initialized");
export { getNostrRuntime, setNostrRuntime };
