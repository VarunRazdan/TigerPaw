export type {
  SignalType,
  SignalConfig,
  EntryRule,
  ExitRule,
  PositionSizing,
  PositionSizingMethod,
  StrategyDefinition,
  StrategyExecution,
  StrategyExecutionStatus,
  SignalResult,
} from "./types.js";

export {
  listStrategies,
  getStrategy,
  saveStrategy,
  deleteStrategy,
  toggleStrategy,
  listExecutions,
  recordExecution,
  clearExecutions,
} from "./registry.js";

export {
  evaluateSignal,
  evaluateSignals,
  type MarketSnapshot,
} from "./signals.js";
export { executeStrategy, type RunnerDependencies } from "./runner.js";
