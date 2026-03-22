import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/nextcloud-talk";

const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Nextcloud Talk runtime not initialized");
export { getNextcloudTalkRuntime, setNextcloudTalkRuntime };
