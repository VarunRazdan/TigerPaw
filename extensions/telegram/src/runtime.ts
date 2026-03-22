import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/telegram";

const { setRuntime: setTelegramRuntime, getRuntime: getTelegramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { getTelegramRuntime, setTelegramRuntime };
