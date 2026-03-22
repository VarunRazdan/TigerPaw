// ---------------------------------------------------------------------------
// Coinbase extension configuration
// ---------------------------------------------------------------------------

export type CoinbaseConfig = {
  apiKey: string;
  apiSecret: string;
  mode: "live" | "sandbox";
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

export function getBaseUrl(mode: "live" | "sandbox"): string {
  return mode === "live" ? "https://api.coinbase.com" : "https://api-sandbox.coinbase.com";
}

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const coinbaseConfigSchema = {
  parse(value: unknown): CoinbaseConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("coinbase config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["apiKey", "apiSecret", "mode"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`coinbase config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.apiKey !== "string" || cfg.apiKey.length === 0) {
      throw new Error("coinbase: apiKey is required (string)");
    }
    if (typeof cfg.apiSecret !== "string" || cfg.apiSecret.length === 0) {
      throw new Error("coinbase: apiSecret is required (string)");
    }

    let mode: "live" | "sandbox" = "sandbox";
    if (cfg.mode !== undefined) {
      if (cfg.mode !== "live" && cfg.mode !== "sandbox") {
        throw new Error('coinbase: mode must be "live" or "sandbox"');
      }
      mode = cfg.mode;
    }

    return {
      apiKey: resolveEnvVars(cfg.apiKey),
      apiSecret: resolveEnvVars(cfg.apiSecret),
      mode,
    };
  },

  uiHints: {
    apiKey: {
      label: "API Key",
      sensitive: true,
      placeholder: "Your Coinbase Advanced Trade API key",
      help: "API key for Coinbase Advanced Trade (or use ${COINBASE_API_KEY})",
    },
    apiSecret: {
      label: "API Secret",
      sensitive: true,
      placeholder: "Your Coinbase Advanced Trade API secret",
      help: "API secret for Coinbase Advanced Trade (or use ${COINBASE_API_SECRET})",
    },
    mode: {
      label: "Trading Mode",
      sensitive: false,
      placeholder: "sandbox",
      help: 'Use "sandbox" for simulated trading (no real money) or "live" for real trading. Defaults to "sandbox".',
    },
  },
};
