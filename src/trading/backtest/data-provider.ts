/**
 * Data provider abstraction for backtest OHLCV data.
 *
 * Allows the backtest engine to source data from synthetic generation
 * or real market data APIs (e.g., Alpaca).
 */
import type { OHLCV } from "./types.js";

export type DataSource = "synthetic" | "alpaca";

export type DataProviderRequest = {
  symbol: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  timeframe?: string; // "1Day" default
};

export type DataProviderResult = {
  bars: OHLCV[];
  source: DataSource;
  cached: boolean;
  metadata?: {
    fetchedAt: string;
    barCount: number;
    firstBar: string;
    lastBar: string;
  };
};

export interface DataProvider {
  readonly source: DataSource;
  isAvailable(): Promise<boolean>;
  fetchBars(request: DataProviderRequest): Promise<DataProviderResult>;
}
