// Audit log
export type { AuditAction, AuditActor, AuditLogEntry } from "./audit-log.js";
export {
  configureAuditLog,
  readAuditEntries,
  verifyAuditChain,
  writeAuditEntry,
} from "./audit-log.js";

// Policy engine
export type {
  ApprovalMode,
  PolicyDecision,
  PolicyDecisionOutcome,
  RiskTier,
  TradeOrder,
  TradingPolicyConfig,
} from "./policy-engine.js";
export { RISK_TIER_PRESETS, TradingPolicyEngine } from "./policy-engine.js";

// Policy state
export type { TradingPolicyState } from "./policy-state.js";
export {
  loadPolicyState,
  savePolicyState,
  updatePolicyState,
  withPlatformPortfolio,
  withPlatformPositionCount,
} from "./policy-state.js";

// Kill switch
export type { KillSwitchMode, KillSwitchStatus } from "./kill-switch.js";
export {
  activateKillSwitch,
  activatePlatformKillSwitch,
  autoActivateIfBreached,
  checkKillSwitch,
  checkPlatformKillSwitch,
  deactivateKillSwitch,
  deactivatePlatformKillSwitch,
  isOrderAllowedUnderKillSwitch,
} from "./kill-switch.js";

// Config
export type { TradingConfig, TradingConfigValidationError } from "./config.js";
export {
  DEFAULT_TRADING_CONFIG,
  resolveEffectiveApprovalMode,
  validateTradingConfig,
} from "./config.js";
