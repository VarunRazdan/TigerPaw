/**
 * Resolve a data provider by name, with fallback to synthetic.
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { AlpacaDataProvider } from "./alpaca-provider.js";
import type { DataProvider, DataSource } from "./data-provider.js";
import { SyntheticDataProvider } from "./synthetic-provider.js";

const log = createSubsystemLogger("trading/backtest/provider");

export async function resolveDataProvider(
  requestedSource: DataSource | undefined,
): Promise<DataProvider> {
  if (requestedSource === "alpaca") {
    const provider = new AlpacaDataProvider();
    if (await provider.isAvailable()) {
      return provider;
    }
    log.warn("Alpaca data provider not available (API keys not configured), falling back to synthetic");
  }

  return new SyntheticDataProvider();
}
