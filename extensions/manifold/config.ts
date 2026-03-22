// ---------------------------------------------------------------------------
// Manifold Markets extension configuration
// ---------------------------------------------------------------------------
// Manifold uses play money (Mana), so the policy engine approval mode
// defaults to "auto" -- no real-money risk means trades can execute without
// manual confirmation by default.

export type ManifoldConfig = {
  apiKey?: string;
};

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

export const BASE_URL = "https://api.manifold.markets/v0";

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

export const manifoldConfigSchema = {
  parse(value: unknown): ManifoldConfig {
    if (value === undefined || value === null) {
      // No config at all is valid -- read-only mode with no API key.
      return {};
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("manifold config must be an object");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["apiKey"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`manifold config has unknown keys: ${unknown.join(", ")}`);
    }

    let apiKey: string | undefined;
    if (cfg.apiKey !== undefined) {
      if (typeof cfg.apiKey !== "string" || cfg.apiKey.length === 0) {
        throw new Error("manifold: apiKey must be a non-empty string when provided");
      }
      apiKey = resolveEnvVars(cfg.apiKey);
    }

    return { apiKey };
  },

  uiHints: {
    apiKey: {
      label: "API Key",
      sensitive: true,
      placeholder: "Your Manifold Markets API key",
      help: "API key for Manifold Markets (or use ${MANIFOLD_API_KEY}). Optional for read-only access; required for placing bets and selling shares.",
    },
  },
};
