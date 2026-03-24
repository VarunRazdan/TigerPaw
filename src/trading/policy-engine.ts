import { createSubsystemLogger } from "../logging/subsystem.js";
import { writeAuditEntry } from "./audit-log.js";
import { emitTradingEvent } from "./event-emitter.js";
import {
  checkPlatformKillSwitch,
  isOrderAllowedUnderKillSwitch,
  autoActivateIfBreached,
} from "./kill-switch.js";
import { loadPolicyState } from "./policy-state.js";
import type { TradingPolicyState } from "./policy-state.js";

const log = createSubsystemLogger("trading/policy-engine");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalMode = "auto" | "confirm" | "manual";

export type RiskTier = "conservative" | "moderate" | "aggressive" | "custom";

export type TradingPolicyConfig = {
  tier: RiskTier;
  approvalMode: ApprovalMode;
  limits: {
    maxRiskPerTradePercent: number;
    dailyLossLimitPercent: number;
    maxPortfolioDrawdownPercent: number;
    maxSinglePositionPercent: number;
    maxTradesPerDay: number;
    maxOpenPositions: number;
    cooldownBetweenTradesMs: number;
    consecutiveLossPause: number;
    maxDailySpendUsd: number;
    maxSingleTradeUsd: number;
  };
  confirm: {
    timeoutMs: number;
    showNotification: boolean;
  };
  manual: {
    timeoutMs: number;
  };
  perExtension?: Record<
    string,
    Partial<TradingPolicyConfig["limits"]> & {
      approvalMode?: ApprovalMode;
    }
  >;
};

export type TradeOrder = {
  id: string;
  extensionId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  priceUsd: number;
  notionalUsd: number;
  orderType: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  limitPrice?: number;
  stopPrice?: number;
  trailingStopPercent?: number;
  metadata?: Record<string, unknown>;
};

export type PolicyDecisionOutcome = "approved" | "denied" | "pending_confirmation";

export type PolicyDecision = {
  outcome: PolicyDecisionOutcome;
  /** Human-readable reason for the decision. */
  reason: string;
  /** Which validation step produced the decision (when denied). */
  failedStep?: string;
  /** The approval mode that applies to this order. */
  approvalMode: ApprovalMode;
  /** Timeout in ms for confirm/manual modes. */
  timeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Risk tier presets
// ---------------------------------------------------------------------------

export const RISK_TIER_PRESETS: Record<Exclude<RiskTier, "custom">, TradingPolicyConfig> = {
  conservative: {
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
    confirm: { timeoutMs: 15_000, showNotification: true },
    manual: { timeoutMs: 300_000 },
  },
  moderate: {
    tier: "moderate",
    approvalMode: "confirm",
    limits: {
      maxRiskPerTradePercent: 2,
      dailyLossLimitPercent: 5,
      maxPortfolioDrawdownPercent: 20,
      maxSinglePositionPercent: 10,
      maxTradesPerDay: 25,
      maxOpenPositions: 8,
      cooldownBetweenTradesMs: 30_000,
      consecutiveLossPause: 5,
      maxDailySpendUsd: 500,
      maxSingleTradeUsd: 100,
    },
    confirm: { timeoutMs: 15_000, showNotification: true },
    manual: { timeoutMs: 300_000 },
  },
  aggressive: {
    tier: "aggressive",
    approvalMode: "auto",
    limits: {
      maxRiskPerTradePercent: 5,
      dailyLossLimitPercent: 10,
      maxPortfolioDrawdownPercent: 30,
      maxSinglePositionPercent: 15,
      maxTradesPerDay: 50,
      maxOpenPositions: 20,
      cooldownBetweenTradesMs: 10_000,
      consecutiveLossPause: 8,
      maxDailySpendUsd: 2000,
      maxSingleTradeUsd: 500,
    },
    confirm: { timeoutMs: 15_000, showNotification: true },
    manual: { timeoutMs: 300_000 },
  },
};

// ---------------------------------------------------------------------------
// Validation pipeline helpers
// ---------------------------------------------------------------------------

type ValidationStep = {
  name: string;
  check: (
    order: TradeOrder,
    limits: TradingPolicyConfig["limits"],
    state: TradingPolicyState,
  ) => string | undefined;
};

/** Returns a denial reason string if the check fails, undefined if it passes. */
const VALIDATION_STEPS: ValidationStep[] = [
  {
    name: "numeric_sanity",
    check: (order) => {
      if (!Number.isFinite(order.notionalUsd) || order.notionalUsd < 0) {
        return `invalid notional value: ${order.notionalUsd}`;
      }
      if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
        return `invalid quantity: ${order.quantity}`;
      }
      if (!Number.isFinite(order.priceUsd) || order.priceUsd < 0) {
        return `invalid price: ${order.priceUsd}`;
      }
      if (order.notionalUsd === 0 && order.side === "buy") {
        return "buy orders must have a non-zero notional value";
      }
      return undefined;
    },
  },
  {
    name: "cooldown",
    check: (_order, limits, state) => {
      if (state.lastTradeAtMs <= 0) {
        return undefined;
      }
      const elapsed = Date.now() - state.lastTradeAtMs;
      if (elapsed < limits.cooldownBetweenTradesMs) {
        const remaining = Math.ceil((limits.cooldownBetweenTradesMs - elapsed) / 1000);
        return `cooldown active: ${remaining}s remaining`;
      }
      return undefined;
    },
  },
  {
    name: "balance_check",
    check: (order, limits, state) => {
      if (state.currentPortfolioValueUsd <= 0) {
        return undefined;
      }
      const riskPercent = (order.notionalUsd / state.currentPortfolioValueUsd) * 100;
      if (riskPercent > limits.maxRiskPerTradePercent) {
        return `per-trade risk ${riskPercent.toFixed(2)}% exceeds limit ${limits.maxRiskPerTradePercent}%`;
      }
      return undefined;
    },
  },
  {
    name: "per_trade_size",
    check: (order, limits) => {
      if (order.notionalUsd > limits.maxSingleTradeUsd) {
        return `trade size $${order.notionalUsd.toFixed(2)} exceeds max $${limits.maxSingleTradeUsd.toFixed(2)}`;
      }
      return undefined;
    },
  },
  {
    name: "daily_loss",
    check: (_order, limits, state) => {
      if (state.currentPortfolioValueUsd <= 0) {
        return undefined;
      }
      const dailyLossPercent =
        (Math.abs(Math.min(0, state.dailyPnlUsd)) / state.currentPortfolioValueUsd) * 100;
      if (dailyLossPercent >= limits.dailyLossLimitPercent) {
        return `daily loss ${dailyLossPercent.toFixed(2)}% at or beyond limit ${limits.dailyLossLimitPercent}%`;
      }
      return undefined;
    },
  },
  {
    name: "position_concentration",
    check: (order, limits, state) => {
      if (state.currentPortfolioValueUsd <= 0) {
        return undefined;
      }
      const existing = state.positionsByAsset[order.symbol];
      const currentValue = existing?.valueUsd ?? 0;
      const projectedPercent =
        ((currentValue + order.notionalUsd) / state.currentPortfolioValueUsd) * 100;
      if (projectedPercent > limits.maxSinglePositionPercent) {
        return `position concentration ${projectedPercent.toFixed(2)}% exceeds limit ${limits.maxSinglePositionPercent}%`;
      }
      return undefined;
    },
  },
  {
    name: "max_open_positions",
    check: (_order, limits, state) => {
      if (state.openPositionCount >= limits.maxOpenPositions) {
        return `open positions (${state.openPositionCount}) at limit (${limits.maxOpenPositions})`;
      }
      return undefined;
    },
  },
  {
    name: "max_trades_per_day",
    check: (_order, limits, state) => {
      if (state.dailyTradeCount >= limits.maxTradesPerDay) {
        return `daily trade count (${state.dailyTradeCount}) at limit (${limits.maxTradesPerDay})`;
      }
      return undefined;
    },
  },
  {
    name: "daily_spend",
    check: (order, limits, state) => {
      if (state.dailySpendUsd + order.notionalUsd > limits.maxDailySpendUsd) {
        return `daily spend $${(state.dailySpendUsd + order.notionalUsd).toFixed(2)} would exceed limit $${limits.maxDailySpendUsd.toFixed(2)}`;
      }
      return undefined;
    },
  },
  {
    name: "consecutive_losses",
    check: (_order, limits, state) => {
      if (state.consecutiveLosses >= limits.consecutiveLossPause) {
        return `consecutive losses (${state.consecutiveLosses}) at pause threshold (${limits.consecutiveLossPause})`;
      }
      return undefined;
    },
  },
];

// ---------------------------------------------------------------------------
// Policy Engine
// ---------------------------------------------------------------------------

export class TradingPolicyEngine {
  private readonly config: TradingPolicyConfig;

  constructor(config: TradingPolicyConfig) {
    this.config = config;
  }

  /**
   * Resolve the effective limits for an order, merging per-extension overrides.
   */
  private resolveLimits(extensionId: string): TradingPolicyConfig["limits"] {
    const overrides = this.config.perExtension?.[extensionId];
    if (!overrides) {
      return this.config.limits;
    }
    return { ...this.config.limits, ...overrides };
  }

  /**
   * Resolve the effective approval mode for an extension.
   */
  private resolveApprovalMode(extensionId: string): ApprovalMode {
    const perExt = this.config.perExtension?.[extensionId]?.approvalMode;
    if (!perExt) {
      return this.config.approvalMode;
    }

    // Per-extension override must not weaken (reduce strictness below) global mode.
    // Strictness order: manual > confirm > auto.
    const STRICTNESS: Record<ApprovalMode, number> = { manual: 2, confirm: 1, auto: 0 };
    if (STRICTNESS[perExt] < STRICTNESS[this.config.approvalMode]) {
      log.warn(
        `perExtension "${extensionId}" tried to weaken approvalMode from "${this.config.approvalMode}" to "${perExt}" — using global mode`,
      );
      return this.config.approvalMode;
    }
    return perExt;
  }

  /**
   * Run the full pre-trade validation pipeline against the current policy state.
   *
   * Pipeline order:
   * 1. Kill switch check
   * 2. (Extension enabled check -- placeholder for extension registry)
   * 3. Cooldown
   * 4. Balance / risk-per-trade
   * 5. Per-trade size
   * 6. Daily loss
   * 7. Position concentration
   * 8. Max open positions
   * 9. Max trades/day
   * 10. Daily spend
   * 11. Consecutive losses
   */
  async evaluateOrder(order: TradeOrder): Promise<PolicyDecision> {
    // Step 1: Kill switch (highest priority gate).
    // In "soft" mode, sells and cancellations are allowed through.
    const killStatus = await checkPlatformKillSwitch(order.extensionId);
    if (killStatus.active && !isOrderAllowedUnderKillSwitch(killStatus, order.side)) {
      const reason = `kill switch active (${killStatus.mode ?? "hard"} mode): ${killStatus.reason ?? "no reason provided"}`;
      log.warn(`order ${order.id} denied: ${reason}`);
      await writeAuditEntry({
        extensionId: order.extensionId,
        action: "denied",
        actor: "system",
        orderSnapshot: order,
        policySnapshot: this.config,
        error: reason,
      });
      emitTradingEvent({
        type: "trading.order.denied",
        timestamp: Date.now(),
        payload: {
          orderId: order.id,
          extensionId: order.extensionId,
          symbol: order.symbol,
          side: order.side,
          notionalUsd: order.notionalUsd,
          reason,
          failedStep: "kill_switch",
        },
      });
      return {
        outcome: "denied",
        reason,
        failedStep: "kill_switch",
        approvalMode: this.resolveApprovalMode(order.extensionId),
      };
    }

    // Load current state for validation checks.
    const state = await loadPolicyState();
    const limits = this.resolveLimits(order.extensionId);

    // Auto-activate kill switch if risk thresholds are already breached.
    const breached = await autoActivateIfBreached(state, {
      dailyLossLimitPercent: limits.dailyLossLimitPercent,
      maxPortfolioDrawdownPercent: limits.maxPortfolioDrawdownPercent,
      consecutiveLossPause: limits.consecutiveLossPause,
    });
    if (breached) {
      const reason = "kill switch auto-activated due to risk threshold breach";
      await writeAuditEntry({
        extensionId: order.extensionId,
        action: "denied",
        actor: "system",
        orderSnapshot: order,
        policySnapshot: this.config,
        error: reason,
      });
      emitTradingEvent({
        type: "trading.order.denied",
        timestamp: Date.now(),
        payload: {
          orderId: order.id,
          extensionId: order.extensionId,
          symbol: order.symbol,
          side: order.side,
          notionalUsd: order.notionalUsd,
          reason,
          failedStep: "kill_switch_auto",
        },
      });
      return {
        outcome: "denied",
        reason,
        failedStep: "kill_switch_auto",
        approvalMode: this.resolveApprovalMode(order.extensionId),
      };
    }

    // Run each validation step in order.
    for (const step of VALIDATION_STEPS) {
      const denial = step.check(order, limits, state);
      if (denial) {
        log.info(`order ${order.id} denied at step "${step.name}": ${denial}`);
        await writeAuditEntry({
          extensionId: order.extensionId,
          action: "limit_exceeded",
          actor: "system",
          orderSnapshot: order,
          policySnapshot: this.config,
          error: denial,
        });
        emitTradingEvent({
          type: "trading.order.denied",
          timestamp: Date.now(),
          payload: {
            orderId: order.id,
            extensionId: order.extensionId,
            symbol: order.symbol,
            side: order.side,
            notionalUsd: order.notionalUsd,
            reason: denial,
            failedStep: step.name,
          },
        });
        return {
          outcome: "denied",
          reason: denial,
          failedStep: step.name,
          approvalMode: this.resolveApprovalMode(order.extensionId),
        };
      }
    }

    // All checks passed -- determine approval mode.
    const mode = this.resolveApprovalMode(order.extensionId);

    if (mode === "auto") {
      log.info(`order ${order.id} auto-approved`);
      await writeAuditEntry({
        extensionId: order.extensionId,
        action: "auto_approved",
        actor: "system",
        orderSnapshot: order,
        policySnapshot: this.config,
      });
      emitTradingEvent({
        type: "trading.order.approved",
        timestamp: Date.now(),
        payload: {
          orderId: order.id,
          extensionId: order.extensionId,
          symbol: order.symbol,
          side: order.side,
          notionalUsd: order.notionalUsd,
          approvalMode: "auto",
        },
      });
      return {
        outcome: "approved",
        reason: "all pre-trade checks passed; auto-approved",
        approvalMode: "auto",
      };
    }

    if (mode === "confirm") {
      log.info(`order ${order.id} pending confirmation (${this.config.confirm.timeoutMs}ms)`);
      await writeAuditEntry({
        extensionId: order.extensionId,
        action: "order_requested",
        actor: "agent",
        orderSnapshot: order,
        policySnapshot: this.config,
      });
      emitTradingEvent({
        type: "trading.order.pending",
        timestamp: Date.now(),
        payload: {
          orderId: order.id,
          extensionId: order.extensionId,
          symbol: order.symbol,
          side: order.side,
          notionalUsd: order.notionalUsd,
          approvalMode: "confirm",
        },
      });
      return {
        outcome: "pending_confirmation",
        reason: "all pre-trade checks passed; awaiting operator confirmation",
        approvalMode: "confirm",
        timeoutMs: this.config.confirm.timeoutMs,
      };
    }

    // Manual mode.
    log.info(`order ${order.id} pending manual approval (${this.config.manual.timeoutMs}ms)`);
    await writeAuditEntry({
      extensionId: order.extensionId,
      action: "order_requested",
      actor: "agent",
      orderSnapshot: order,
      policySnapshot: this.config,
    });
    emitTradingEvent({
      type: "trading.order.pending",
      timestamp: Date.now(),
      payload: {
        orderId: order.id,
        extensionId: order.extensionId,
        symbol: order.symbol,
        side: order.side,
        notionalUsd: order.notionalUsd,
        approvalMode: "manual",
      },
    });
    return {
      outcome: "pending_confirmation",
      reason: "all pre-trade checks passed; awaiting manual operator approval",
      approvalMode: "manual",
      timeoutMs: this.config.manual.timeoutMs,
    };
  }
}
