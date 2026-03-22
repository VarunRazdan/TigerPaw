export const PROJECT_NAME = "tigerpaw" as const;

export const LEGACY_PROJECT_NAMES = ["tigerclaw", "openclaw"] as const;

export const MANIFEST_KEY = PROJECT_NAME;

export const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;

export const LEGACY_PLUGIN_MANIFEST_FILENAMES = [
  "tigerclaw.plugin.json",
  "openclaw.plugin.json",
] as const;

export const LEGACY_CANVAS_HANDLER_NAMES = [] as const;

export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/Tigerpaw" as const;

export const LEGACY_MACOS_APP_SOURCES_DIRS = [
  "apps/macos/Sources/TigerClaw",
  "apps/macos/Sources/OpenClaw",
] as const;
