import { createPluginRuntimeStore } from "tigerpaw/plugin-sdk/compat";
import type { PluginRuntime } from "tigerpaw/plugin-sdk/whatsapp";

const { setRuntime: setWhatsAppRuntime, getRuntime: getWhatsAppRuntime } =
  createPluginRuntimeStore<PluginRuntime>("WhatsApp runtime not initialized");
export { getWhatsAppRuntime, setWhatsAppRuntime };
