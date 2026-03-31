/**
 * Synthetic data provider — wraps the existing GBM-based OHLCV generator.
 */
import { generateOHLCV } from "./data-generator.js";
import type { DataProvider, DataProviderRequest, DataProviderResult } from "./data-provider.js";

export class SyntheticDataProvider implements DataProvider {
  readonly source = "synthetic" as const;

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async fetchBars(request: DataProviderRequest): Promise<DataProviderResult> {
    const bars = generateOHLCV({
      symbol: request.symbol,
      startDate: request.startDate,
      endDate: request.endDate,
      startPrice: 150,
      pattern: "random",
      volatility: 0.3,
      seed: 42,
    });

    return {
      bars,
      source: "synthetic",
      cached: false,
    };
  }
}
