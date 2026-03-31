export type {
  OHLCV,
  BacktestConfig,
  BacktestTrade,
  BacktestResult,
  BacktestMetrics,
  EquityPoint,
} from "./types.js";

export {
  generateOHLCV,
  generateDemoBars,
  type GeneratorConfig,
  type GeneratorPattern,
} from "./data-generator.js";
export { runBacktest } from "./engine.js";
