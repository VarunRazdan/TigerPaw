import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en_assistant from "./locales/en/assistant.json";
import en_channels from "./locales/en/channels.json";
import en_common from "./locales/en/common.json";
import en_config from "./locales/en/config.json";
import en_connect from "./locales/en/connect.json";
import en_dashboard from "./locales/en/dashboard.json";
import en_integrations from "./locales/en/integrations.json";
import en_mcp from "./locales/en/mcp.json";
import en_messageHub from "./locales/en/messageHub.json";
import en_models from "./locales/en/models.json";
import en_notifications from "./locales/en/notifications.json";
import en_onboarding from "./locales/en/onboarding.json";
import en_platforms from "./locales/en/platforms.json";
import en_security from "./locales/en/security.json";
import en_settings from "./locales/en/settings.json";
import en_trading from "./locales/en/trading.json";
import en_workflows from "./locales/en/workflows.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "中文简体" },
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "中文繁體" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" as const },
] as const;

export const RTL_LANGUAGES = new Set(["ar"]);

const NAMESPACES = [
  "common",
  "dashboard",
  "trading",
  "channels",
  "security",
  "config",
  "notifications",
  "connect",
  "settings",
  "platforms",
  "assistant",
  "messageHub",
  "workflows",
  "mcp",
  "models",
  "onboarding",
  "integrations",
] as const;

// Lazy-load non-English locale bundles
const LOCALE_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  de: () => import("./locales/de/index").then((m) => m.default),
  es: () => import("./locales/es/index").then((m) => m.default),
  "pt-BR": () => import("./locales/pt-BR/index").then((m) => m.default),
  "zh-CN": () => import("./locales/zh-CN/index").then((m) => m.default),
  "zh-TW": () => import("./locales/zh-TW/index").then((m) => m.default),
  ja: () => import("./locales/ja/index").then((m) => m.default),
  ko: () => import("./locales/ko/index").then((m) => m.default),
  fr: () => import("./locales/fr/index").then((m) => m.default),
  ar: () => import("./locales/ar/index").then((m) => m.default),
};

const loadedLocales = new Set<string>(["en"]);

export async function loadLocale(lng: string): Promise<void> {
  if (loadedLocales.has(lng) || lng === "en") {
    return;
  }
  const loader = LOCALE_LOADERS[lng];
  if (!loader) {
    return;
  }

  const bundles = await loader();
  for (const ns of NAMESPACES) {
    const data = bundles[ns];
    if (data) {
      i18n.addResourceBundle(lng, ns, data, true, true);
    }
  }
  loadedLocales.add(lng);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: en_common,
        dashboard: en_dashboard,
        trading: en_trading,
        channels: en_channels,
        security: en_security,
        config: en_config,
        notifications: en_notifications,
        connect: en_connect,
        settings: en_settings,
        platforms: en_platforms,
        assistant: en_assistant,
        messageHub: en_messageHub,
        workflows: en_workflows,
        mcp: en_mcp,
        models: en_models,
        onboarding: en_onboarding,
        integrations: en_integrations,
      },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "tigerpaw-language",
    },
  });

// Set document direction on language change
i18n.on("languageChanged", (lng) => {
  const dir = RTL_LANGUAGES.has(lng) ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
});

export default i18n;
