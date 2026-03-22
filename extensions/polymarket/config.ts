// ---------------------------------------------------------------------------
// Polymarket extension configuration
// ---------------------------------------------------------------------------

export type PolymarketConfig = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  privateKey: string;
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
// Config parser and validator
// ---------------------------------------------------------------------------

export const polymarketConfigSchema = {
  parse(value: unknown): PolymarketConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("polymarket config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["apiKey", "apiSecret", "passphrase", "privateKey"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`polymarket config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.apiKey !== "string" || cfg.apiKey.length === 0) {
      throw new Error("polymarket: apiKey is required (string)");
    }
    if (typeof cfg.apiSecret !== "string" || cfg.apiSecret.length === 0) {
      throw new Error("polymarket: apiSecret is required (string)");
    }
    if (typeof cfg.passphrase !== "string" || cfg.passphrase.length === 0) {
      throw new Error("polymarket: passphrase is required (string)");
    }
    if (typeof cfg.privateKey !== "string" || cfg.privateKey.length === 0) {
      throw new Error("polymarket: privateKey is required (string)");
    }

    return {
      apiKey: resolveEnvVars(cfg.apiKey),
      apiSecret: resolveEnvVars(cfg.apiSecret),
      passphrase: resolveEnvVars(cfg.passphrase),
      privateKey: resolveEnvVars(cfg.privateKey),
    };
  },

  uiHints: {
    apiKey: {
      label: "API Key",
      sensitive: true,
      placeholder: "Your Polymarket CLOB API key",
      help: "API key for Polymarket CLOB (or use ${POLYMARKET_API_KEY})",
    },
    apiSecret: {
      label: "API Secret",
      sensitive: true,
      placeholder: "Your Polymarket CLOB API secret",
      help: "API secret for Polymarket CLOB (or use ${POLYMARKET_API_SECRET})",
    },
    passphrase: {
      label: "Passphrase",
      sensitive: true,
      placeholder: "Your Polymarket CLOB passphrase",
      help: "Passphrase for Polymarket CLOB (or use ${POLYMARKET_PASSPHRASE})",
    },
    privateKey: {
      label: "Private Key",
      sensitive: true,
      placeholder: "Your Ethereum private key for signing",
      help: "Ethereum private key for on-chain signing (or use ${POLYMARKET_PRIVATE_KEY})",
    },
  },
};
