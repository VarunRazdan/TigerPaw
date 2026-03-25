import type { TradingEventType } from "./events.js";
import type { TradingPolicyConfig } from "./policy-engine.js";

export type TradingNotificationTarget = {
  /** Channel to send notifications to (e.g. "telegram", "discord", "slack"). */
  channel: string;
  /** Target ID — chat ID, channel ID, user ID depending on the channel. */
  to: string;
  /** Account ID for multi-account channels (optional). */
  accountId?: string;
  /** Thread/topic ID for threaded channels (optional). */
  threadId?: string;
  /** Which events to send. Omit to receive all events. */
  events?: TradingEventType[];
};

export type TradingNotificationsConfig = {
  /** Enable proactive trading notifications to messaging channels. Default: false. */
  enabled?: boolean;
  /** Channels to send notifications to. */
  targets?: TradingNotificationTarget[];
};

export type TradingConfig = {
  /** Enable the trading subsystem. Default: false. */
  enabled: boolean;
  /** Paper mode for simulation, live mode for real trades. Default: "paper". */
  mode: "paper" | "live";
  /** Trading policy configuration. */
  policy: TradingPolicyConfig;
  /** Default sync interval in ms for all extensions. Extensions can override per-platform. */
  syncIntervalMs?: number;
  /** Proactive notifications to messaging channels for trading events. */
  notifications?: TradingNotificationsConfig;
  /** Audit log settings. */
  auditLog: {
    /** Override the default audit log path (~/.tigerpaw/trading/audit.jsonl). */
    path?: string;
    /** Maximum file size in MB before rotation. Default: 50. */
    maxFileSizeMb: number;
    /** Number of rotated files to keep. Default: 5. */
    rotateCount: number;
  };
};

export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  enabled: false,
  mode: "paper",
  policy: {
    tier: "conservative",
    approvalMode: "manual",
    limits: {
      maxRiskPerTradePercent: 1,
      dailyLossLimitPercent: 3,
      maxPortfolioDrawdownPercent: 10,
      maxSinglePositionPercent: 5,
      maxTradesPerDay: 10,
      maxOpenPositions: 3,
      cooldownBetweenTradesMs: 60_000,
      consecutiveLossPause: 3,
      maxDailySpendUsd: 100,
      maxSingleTradeUsd: 25,
    },
    confirm: {
      timeoutMs: 15_000,
      showNotification: true,
      timeoutAction: "deny",
    },
    manual: {
      timeoutMs: 300_000,
      timeoutAction: "deny",
    },
  },
  auditLog: {
    maxFileSizeMb: 50,
    rotateCount: 5,
  },
};

export type TradingConfigValidationError = {
  field: string;
  message: string;
};

/**
 * Validate a trading config for internal consistency.
 * Returns an empty array when the config is valid.
 */
export function validateTradingConfig(config: TradingConfig): TradingConfigValidationError[] {
  const errors: TradingConfigValidationError[] = [];

  if (config.mode === "live") {
    const lim = config.policy.limits;

    if (!Number.isFinite(lim.maxDailySpendUsd) || lim.maxDailySpendUsd <= 0) {
      errors.push({
        field: "policy.limits.maxDailySpendUsd",
        message: "Live mode requires a finite positive maxDailySpendUsd",
      });
    }
    if (!Number.isFinite(lim.maxSingleTradeUsd) || lim.maxSingleTradeUsd <= 0) {
      errors.push({
        field: "policy.limits.maxSingleTradeUsd",
        message: "Live mode requires a finite positive maxSingleTradeUsd",
      });
    }
    if (!Number.isFinite(lim.maxRiskPerTradePercent) || lim.maxRiskPerTradePercent <= 0) {
      errors.push({
        field: "policy.limits.maxRiskPerTradePercent",
        message: "Live mode requires a finite positive maxRiskPerTradePercent",
      });
    }
    if (!Number.isFinite(lim.dailyLossLimitPercent) || lim.dailyLossLimitPercent <= 0) {
      errors.push({
        field: "policy.limits.dailyLossLimitPercent",
        message: "Live mode requires a finite positive dailyLossLimitPercent",
      });
    }
    if (!Number.isFinite(lim.maxPortfolioDrawdownPercent) || lim.maxPortfolioDrawdownPercent <= 0) {
      errors.push({
        field: "policy.limits.maxPortfolioDrawdownPercent",
        message: "Live mode requires a finite positive maxPortfolioDrawdownPercent",
      });
    }
    if (!Number.isFinite(lim.maxSinglePositionPercent) || lim.maxSinglePositionPercent <= 0) {
      errors.push({
        field: "policy.limits.maxSinglePositionPercent",
        message: "Live mode requires a finite positive maxSinglePositionPercent",
      });
    }
    if (!Number.isFinite(lim.maxTradesPerDay) || lim.maxTradesPerDay <= 0) {
      errors.push({
        field: "policy.limits.maxTradesPerDay",
        message: "Live mode requires a finite positive maxTradesPerDay",
      });
    }
    if (!Number.isFinite(lim.maxOpenPositions) || lim.maxOpenPositions <= 0) {
      errors.push({
        field: "policy.limits.maxOpenPositions",
        message: "Live mode requires a finite positive maxOpenPositions",
      });
    }
    if (!Number.isFinite(lim.cooldownBetweenTradesMs) || lim.cooldownBetweenTradesMs < 0) {
      errors.push({
        field: "policy.limits.cooldownBetweenTradesMs",
        message: "Live mode requires a finite non-negative cooldownBetweenTradesMs",
      });
    }
    if (!Number.isFinite(lim.consecutiveLossPause) || lim.consecutiveLossPause <= 0) {
      errors.push({
        field: "policy.limits.consecutiveLossPause",
        message: "Live mode requires a finite positive consecutiveLossPause",
      });
    }
  }

  // Validate per-extension overrides in live mode — they must not weaken limits.
  if (config.mode === "live" && config.policy.perExtension) {
    const numericLimitKeys: Array<keyof TradingPolicyConfig["limits"]> = [
      "maxDailySpendUsd",
      "maxSingleTradeUsd",
      "maxRiskPerTradePercent",
      "dailyLossLimitPercent",
      "maxPortfolioDrawdownPercent",
      "maxSinglePositionPercent",
      "maxTradesPerDay",
      "maxOpenPositions",
      "cooldownBetweenTradesMs",
      "consecutiveLossPause",
    ];
    for (const [extId, overrides] of Object.entries(config.policy.perExtension)) {
      if (!overrides) {
        continue;
      }
      for (const key of numericLimitKeys) {
        const val = overrides[key];
        if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
          errors.push({
            field: `policy.perExtension.${extId}.${key}`,
            message: `Live mode requires finite non-negative ${key} in perExtension override for "${extId}" (got ${val})`,
          });
        }
      }
    }
  }

  // Cross-field consistency checks.
  const lim = config.policy.limits;
  if (lim.maxRiskPerTradePercent > lim.dailyLossLimitPercent) {
    errors.push({
      field: "policy.limits.maxRiskPerTradePercent",
      message: `maxRiskPerTradePercent (${lim.maxRiskPerTradePercent}%) should not exceed dailyLossLimitPercent (${lim.dailyLossLimitPercent}%)`,
    });
  }
  if (lim.maxSingleTradeUsd > lim.maxDailySpendUsd) {
    errors.push({
      field: "policy.limits.maxSingleTradeUsd",
      message: `maxSingleTradeUsd ($${lim.maxSingleTradeUsd}) should not exceed maxDailySpendUsd ($${lim.maxDailySpendUsd})`,
    });
  }
  if (lim.maxSinglePositionPercent > 100) {
    errors.push({
      field: "policy.limits.maxSinglePositionPercent",
      message: "maxSinglePositionPercent cannot exceed 100%",
    });
  }

  // Paper mode defaults approval to auto if not explicitly set otherwise.
  // This is handled at runtime, not validation, so no error here.

  if (config.auditLog.maxFileSizeMb <= 0) {
    errors.push({
      field: "auditLog.maxFileSizeMb",
      message: "maxFileSizeMb must be positive",
    });
  }
  if (config.auditLog.rotateCount < 0) {
    errors.push({
      field: "auditLog.rotateCount",
      message: "rotateCount must be non-negative",
    });
  }

  return errors;
}

/**
 * Resolve the effective approval mode, accounting for paper mode default.
 * In paper mode the approval mode defaults to "auto" unless explicitly overridden.
 */
export function resolveEffectiveApprovalMode(config: TradingConfig): TradingConfig {
  if (config.mode === "paper" && config.policy.approvalMode !== "manual") {
    return {
      ...config,
      policy: {
        ...config.policy,
        approvalMode: "auto",
      },
    };
  }
  return config;
}
