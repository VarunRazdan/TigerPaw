// ---------------------------------------------------------------------------
// IBKR extension configuration
// ---------------------------------------------------------------------------

export type IbkrConfig = {
  accountId: string;
  gatewayHost: string;
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

export function getBaseUrl(gatewayHost: string): string {
  return `https://${gatewayHost}/v1/api`;
}

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const ibkrConfigSchema = {
  parse(value: unknown): IbkrConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("ibkr config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["accountId", "gatewayHost", "mode", "syncIntervalMs"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`ibkr config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.accountId !== "string" || cfg.accountId.length === 0) {
      throw new Error("ibkr: accountId is required (string)");
    }

    let gatewayHost = "localhost:5000";
    if (cfg.gatewayHost !== undefined) {
      if (typeof cfg.gatewayHost !== "string" || cfg.gatewayHost.length === 0) {
        throw new Error("ibkr: gatewayHost must be a non-empty string");
      }
      gatewayHost = cfg.gatewayHost;
    }

    let mode: "paper" | "live" = "paper";
    if (cfg.mode !== undefined) {
      if (cfg.mode !== "paper" && cfg.mode !== "live") {
        throw new Error('ibkr: mode must be "paper" or "live"');
      }
      mode = cfg.mode;
    }

    const syncIntervalMs = typeof cfg.syncIntervalMs === "number" ? cfg.syncIntervalMs : undefined;

    return {
      accountId: resolveEnvVars(cfg.accountId),
      gatewayHost: resolveEnvVars(gatewayHost),
      mode,
      syncIntervalMs,
    };
  },

  uiHints: {
    accountId: {
      label: "Account ID",
      sensitive: true,
      placeholder: "Your IBKR account ID",
      help: "Interactive Brokers account ID (or use ${IBKR_ACCOUNT_ID})",
    },
    gatewayHost: {
      label: "Gateway Host",
      sensitive: false,
      placeholder: "localhost:5000",
      help: "IB Client Portal Gateway host:port (default localhost:5000)",
    },
    mode: {
      label: "Trading Mode",
      sensitive: false,
      placeholder: "paper",
      help: 'Use "paper" for simulated trading (no real money) or "live" for real trading. Defaults to "paper".',
    },
  },
};
