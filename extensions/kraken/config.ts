// ---------------------------------------------------------------------------
// Kraken extension configuration
// ---------------------------------------------------------------------------

export type KrakenConfig = {
  apiKey: string;
  apiSecret: string;
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
// Base URL (Kraken has a single API endpoint)
// ---------------------------------------------------------------------------

export const BASE_URL = "https://api.kraken.com";

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const krakenConfigSchema = {
  parse(value: unknown): KrakenConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("kraken config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["apiKey", "apiSecret"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`kraken config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.apiKey !== "string" || cfg.apiKey.length === 0) {
      throw new Error("kraken: apiKey is required (string)");
    }
    if (typeof cfg.apiSecret !== "string" || cfg.apiSecret.length === 0) {
      throw new Error("kraken: apiSecret is required (string)");
    }

    return {
      apiKey: resolveEnvVars(cfg.apiKey),
      apiSecret: resolveEnvVars(cfg.apiSecret),
    };
  },

  uiHints: {
    apiKey: {
      label: "API Key",
      sensitive: true,
      placeholder: "Your Kraken API key",
      help: "API key for Kraken (or use ${KRAKEN_API_KEY})",
    },
    apiSecret: {
      label: "API Secret",
      sensitive: true,
      placeholder: "Your Kraken API secret (base64)",
      help: "API secret for Kraken (or use ${KRAKEN_API_SECRET})",
    },
  },
};
