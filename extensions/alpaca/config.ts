// ---------------------------------------------------------------------------
// Alpaca extension configuration
// ---------------------------------------------------------------------------

export type AlpacaConfig = {
  apiKeyId: string;
  apiSecretKey: string;
  mode: "paper" | "live";
  syncIntervalMs?: number;
};

// ---------------------------------------------------------------------------
// Environment variable resolution
// ---------------------------------------------------------------------------

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

// ---------------------------------------------------------------------------
// Base URL resolver
// ---------------------------------------------------------------------------

export function getBaseUrl(mode: "paper" | "live"): string {
  return mode === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

export const DATA_BASE_URL = "https://data.alpaca.markets";

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const alpacaConfigSchema = {
  parse(value: unknown): AlpacaConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("alpaca config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["apiKeyId", "apiSecretKey", "mode", "syncIntervalMs"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`alpaca config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.apiKeyId !== "string" || cfg.apiKeyId.length === 0) {
      throw new Error("alpaca: apiKeyId is required (string)");
    }
    if (typeof cfg.apiSecretKey !== "string" || cfg.apiSecretKey.length === 0) {
      throw new Error("alpaca: apiSecretKey is required (string)");
    }

    let mode: "paper" | "live" = "paper";
    if (cfg.mode !== undefined) {
      if (cfg.mode !== "paper" && cfg.mode !== "live") {
        throw new Error('alpaca: mode must be "paper" or "live"');
      }
      mode = cfg.mode;
    }

    const syncIntervalMs = typeof cfg.syncIntervalMs === "number" ? cfg.syncIntervalMs : undefined;

    return {
      apiKeyId: resolveEnvVars(cfg.apiKeyId),
      apiSecretKey: resolveEnvVars(cfg.apiSecretKey),
      mode,
      syncIntervalMs,
    };
  },

  uiHints: {
    apiKeyId: {
      label: "API Key ID",
      sensitive: true,
      placeholder: "Your Alpaca API key ID",
      help: "API key ID for Alpaca (or use ${ALPACA_API_KEY_ID})",
    },
    apiSecretKey: {
      label: "API Secret Key",
      sensitive: true,
      placeholder: "Your Alpaca API secret key",
      help: "API secret key for Alpaca (or use ${ALPACA_API_SECRET_KEY})",
    },
    mode: {
      label: "Trading Mode",
      sensitive: false,
      placeholder: "paper",
      help: 'Use "paper" for simulated trading (no real money) or "live" for real trading. Defaults to "paper".',
    },
  },
};
