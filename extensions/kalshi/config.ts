// ---------------------------------------------------------------------------
// Kalshi extension configuration
// ---------------------------------------------------------------------------

export type KalshiConfig = {
  email: string;
  apiKeyId: string;
  privateKeyPath: string;
  mode: "demo" | "live";
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

export function getBaseUrl(mode: "demo" | "live"): string {
  return mode === "live"
    ? "https://trading-api.kalshi.com/trade-api/v2"
    : "https://demo-api.kalshi.co/trade-api/v2";
}

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const kalshiConfigSchema = {
  parse(value: unknown): KalshiConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("kalshi config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["email", "apiKeyId", "privateKeyPath", "mode"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`kalshi config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.email !== "string" || cfg.email.length === 0) {
      throw new Error("kalshi: email is required (string)");
    }
    if (typeof cfg.apiKeyId !== "string" || cfg.apiKeyId.length === 0) {
      throw new Error("kalshi: apiKeyId is required (string)");
    }
    if (typeof cfg.privateKeyPath !== "string" || cfg.privateKeyPath.length === 0) {
      throw new Error("kalshi: privateKeyPath is required (string)");
    }

    let mode: "demo" | "live" = "demo";
    if (cfg.mode !== undefined) {
      if (cfg.mode !== "demo" && cfg.mode !== "live") {
        throw new Error('kalshi: mode must be "demo" or "live"');
      }
      mode = cfg.mode;
    }

    return {
      email: resolveEnvVars(cfg.email),
      apiKeyId: resolveEnvVars(cfg.apiKeyId),
      privateKeyPath: resolveEnvVars(cfg.privateKeyPath),
      mode,
    };
  },

  uiHints: {
    apiKeyId: {
      label: "API Key ID",
      sensitive: true,
      placeholder: "Your Kalshi API key ID",
      help: "API key ID for Kalshi (or use ${KALSHI_API_KEY_ID})",
    },
    privateKeyPath: {
      label: "Private Key Path",
      sensitive: true,
      placeholder: "/path/to/kalshi-private-key.pem",
      help: "Path to the PEM file containing your RSA private key for API authentication (or use ${KALSHI_PRIVATE_KEY_PATH})",
    },
    mode: {
      label: "Trading Mode",
      sensitive: false,
      placeholder: "demo",
      help: 'Use "demo" for simulated trading on demo-api.kalshi.co (no real money) or "live" for real trading on trading-api.kalshi.com. Defaults to "demo".',
    },
  },
};
