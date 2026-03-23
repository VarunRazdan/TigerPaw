// ---------------------------------------------------------------------------
// Binance extension configuration
// ---------------------------------------------------------------------------

export type BinanceConfig = {
  apiKey: string;
  apiSecret: string;
  mode: "live" | "testnet";
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

export function getBaseUrl(mode: "live" | "testnet"): string {
  return mode === "live" ? "https://api.binance.com" : "https://testnet.binance.vision";
}

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const binanceConfigSchema = {
  parse(value: unknown): BinanceConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("binance config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["apiKey", "apiSecret", "mode", "syncIntervalMs"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`binance config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.apiKey !== "string" || cfg.apiKey.length === 0) {
      throw new Error("binance: apiKey is required (string)");
    }
    if (typeof cfg.apiSecret !== "string" || cfg.apiSecret.length === 0) {
      throw new Error("binance: apiSecret is required (string)");
    }

    let mode: "live" | "testnet" = "testnet";
    if (cfg.mode !== undefined) {
      if (cfg.mode !== "live" && cfg.mode !== "testnet") {
        throw new Error('binance: mode must be "live" or "testnet"');
      }
      mode = cfg.mode;
    }

    const syncIntervalMs = typeof cfg.syncIntervalMs === "number" ? cfg.syncIntervalMs : undefined;

    return {
      apiKey: resolveEnvVars(cfg.apiKey),
      apiSecret: resolveEnvVars(cfg.apiSecret),
      mode,
      syncIntervalMs,
    };
  },

  uiHints: {
    apiKey: {
      label: "API Key",
      sensitive: true,
      placeholder: "Your Binance API key",
      help: "API key for Binance (or use ${BINANCE_API_KEY})",
    },
    apiSecret: {
      label: "API Secret",
      sensitive: true,
      placeholder: "Your Binance API secret",
      help: "API secret for Binance (or use ${BINANCE_API_SECRET})",
    },
    mode: {
      label: "Trading Mode",
      sensitive: false,
      placeholder: "testnet",
      help: 'Use "testnet" for simulated trading (no real money) or "live" for real trading. Defaults to "testnet".',
    },
  },
};
