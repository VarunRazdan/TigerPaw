// ---------------------------------------------------------------------------
// dYdX v4 extension configuration
// ---------------------------------------------------------------------------

export type DydxConfig = {
  mnemonic: string;
  address?: string;
  mode: "mainnet" | "testnet";
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
// Indexer URL resolver
// ---------------------------------------------------------------------------

export function getIndexerUrl(mode: "mainnet" | "testnet"): string {
  return mode === "mainnet"
    ? "https://indexer.dydx.trade"
    : "https://indexer.v4testnet.dydx.exchange";
}

// ---------------------------------------------------------------------------
// Config parser and validator
// ---------------------------------------------------------------------------

export const dydxConfigSchema = {
  parse(value: unknown): DydxConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("dydx config required");
    }
    const cfg = value as Record<string, unknown>;

    const allowed = ["mnemonic", "address", "mode"];
    const unknown = Object.keys(cfg).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`dydx config has unknown keys: ${unknown.join(", ")}`);
    }

    if (typeof cfg.mnemonic !== "string" || cfg.mnemonic.length === 0) {
      throw new Error("dydx: mnemonic is required (string)");
    }

    let address: string | undefined;
    if (cfg.address !== undefined) {
      if (typeof cfg.address !== "string" || cfg.address.length === 0) {
        throw new Error("dydx: address must be a non-empty string");
      }
      address = cfg.address;
    }

    let mode: "mainnet" | "testnet" = "testnet";
    if (cfg.mode !== undefined) {
      if (cfg.mode !== "mainnet" && cfg.mode !== "testnet") {
        throw new Error('dydx: mode must be "mainnet" or "testnet"');
      }
      mode = cfg.mode;
    }

    return {
      mnemonic: resolveEnvVars(cfg.mnemonic),
      address,
      mode,
    };
  },

  uiHints: {
    mnemonic: {
      label: "Mnemonic",
      sensitive: true,
      placeholder: "Your dYdX wallet mnemonic phrase",
      help: "Cosmos wallet mnemonic for dYdX v4 (or use ${DYDX_MNEMONIC})",
    },
    address: {
      label: "Address",
      sensitive: false,
      placeholder: "dydx1...",
      help: "Your dYdX v4 address (derived from mnemonic if omitted)",
    },
    mode: {
      label: "Network Mode",
      sensitive: false,
      placeholder: "testnet",
      help: 'Use "testnet" for dYdX v4 testnet or "mainnet" for production. Defaults to "testnet".',
    },
  },
};
