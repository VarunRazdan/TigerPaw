import { createSubsystemLogger } from "../logging/subsystem.js";
import { writeAuditEntry, type AuditActor } from "./audit-log.js";
import { emitTradingEvent } from "./event-emitter.js";
import { loadPolicyState, updatePolicyState, type TradingPolicyState } from "./policy-state.js";

const log = createSubsystemLogger("trading/kill-switch");

export type KillSwitchMode = "hard" | "soft";

export type KillSwitchStatus = {
  active: boolean;
  /** "hard" blocks all trades; "soft" allows closes/cancellations but blocks new orders. Default: "hard". */
  mode?: KillSwitchMode;
  activatedAt?: number;
  activatedBy?: string;
  reason?: string;
};

/**
 * Check whether the kill switch is currently active.
 * This is called before every trade evaluation.
 */
export async function checkKillSwitch(): Promise<KillSwitchStatus> {
  const state = await loadPolicyState();
  return {
    active: state.killSwitch.active,
    mode: (state.killSwitch as { mode?: KillSwitchMode }).mode ?? "hard",
    activatedAt: state.killSwitch.activatedAt,
    activatedBy: state.killSwitch.activatedBy,
    reason: state.killSwitch.reason,
  };
}

/**
 * Check whether a specific order side is allowed under the current kill switch state.
 * In "soft" mode, sells and cancellations are allowed (they reduce risk).
 */
export function isOrderAllowedUnderKillSwitch(
  killStatus: KillSwitchStatus,
  orderSide: "buy" | "sell" | "cancel",
): boolean {
  if (!killStatus.active) {
    return true;
  }
  if (killStatus.mode === "soft" && (orderSide === "sell" || orderSide === "cancel")) {
    return true;
  }
  return false;
}

/**
 * Activate the kill switch. All subsequent trade requests will be denied
 * until the switch is explicitly deactivated by an operator.
 *
 * Persists the activation in policy state and writes an audit log entry.
 */
export async function activateKillSwitch(
  reason: string,
  actor: AuditActor,
  mode: KillSwitchMode = "hard",
): Promise<void> {
  const now = Date.now();
  const actorLabel = actor === "system" ? "system" : actor;

  await updatePolicyState((state) => ({
    ...state,
    killSwitch: {
      active: true,
      activatedAt: now,
      activatedBy: actorLabel,
      reason,
      mode,
    },
  }));

  log.warn(`kill switch activated by ${actorLabel}: ${reason}`);

  await writeAuditEntry({
    extensionId: "system",
    action: "kill_switch_activated",
    actor,
    error: reason,
  });

  emitTradingEvent({
    type: "trading.killswitch.activated",
    timestamp: now,
    payload: { reason, mode },
  });
}

/**
 * Deactivate the kill switch, allowing trades to resume.
 * Only operators (humans) should call this.
 */
export async function deactivateKillSwitch(actor: AuditActor): Promise<void> {
  await updatePolicyState((state) => ({
    ...state,
    killSwitch: { active: false },
  }));

  log.info(`kill switch deactivated by ${actor}`);

  await writeAuditEntry({
    extensionId: "system",
    action: "policy_changed",
    actor,
  });

  emitTradingEvent({
    type: "trading.killswitch.deactivated",
    timestamp: Date.now(),
    payload: {},
  });
}

// ---------------------------------------------------------------------------
// Per-platform kill switch
// ---------------------------------------------------------------------------

/**
 * Check whether a specific platform's kill switch is active.
 * A platform is halted if EITHER the global kill switch OR the platform-specific
 * kill switch is active.
 */
export async function checkPlatformKillSwitch(extensionId: string): Promise<KillSwitchStatus> {
  const state = await loadPolicyState();

  // Global kill switch takes precedence.
  if (state.killSwitch.active) {
    return {
      active: true,
      mode: (state.killSwitch as { mode?: KillSwitchMode }).mode ?? "hard",
      activatedAt: state.killSwitch.activatedAt,
      activatedBy: state.killSwitch.activatedBy,
      reason: `global: ${state.killSwitch.reason ?? "no reason"}`,
    };
  }

  // Per-platform kill switch.
  const platformKs = state.platformKillSwitches[extensionId];
  if (platformKs?.active) {
    return {
      active: true,
      mode: "hard",
      activatedAt: platformKs.activatedAt,
      activatedBy: platformKs.activatedBy,
      reason: platformKs.reason,
    };
  }

  return { active: false };
}

/**
 * Activate the kill switch for a specific platform only.
 */
export async function activatePlatformKillSwitch(
  extensionId: string,
  reason: string,
  actor: AuditActor,
): Promise<void> {
  await updatePolicyState((state) => ({
    ...state,
    platformKillSwitches: {
      ...state.platformKillSwitches,
      [extensionId]: {
        active: true,
        activatedAt: Date.now(),
        activatedBy: actor === "system" ? "system" : actor,
        reason,
      },
    },
  }));

  log.warn(`platform kill switch activated for ${extensionId} by ${actor}: ${reason}`);

  await writeAuditEntry({
    extensionId,
    action: "kill_switch_activated",
    actor,
    error: reason,
  });

  emitTradingEvent({
    type: "trading.killswitch.activated",
    timestamp: Date.now(),
    payload: { extensionId, reason },
  });
}

/**
 * Deactivate the kill switch for a specific platform.
 */
export async function deactivatePlatformKillSwitch(
  extensionId: string,
  actor: AuditActor,
): Promise<void> {
  await updatePolicyState((state) => ({
    ...state,
    platformKillSwitches: {
      ...state.platformKillSwitches,
      [extensionId]: { active: false },
    },
  }));

  log.info(`platform kill switch deactivated for ${extensionId} by ${actor}`);

  await writeAuditEntry({
    extensionId,
    action: "policy_changed",
    actor,
  });

  emitTradingEvent({
    type: "trading.killswitch.deactivated",
    timestamp: Date.now(),
    payload: { extensionId },
  });
}

/**
 * Auto-activate the kill switch when risk limits are breached.
 * Called internally by the policy engine when daily loss, drawdown,
 * or consecutive loss thresholds are exceeded.
 */
export async function autoActivateIfBreached(
  state: TradingPolicyState,
  limits: {
    dailyLossLimitPercent: number;
    maxPortfolioDrawdownPercent: number;
    consecutiveLossPause: number;
  },
): Promise<boolean> {
  // Daily loss limit breach.
  if (state.currentPortfolioValueUsd > 0) {
    const dailyLossPercent =
      (Math.abs(Math.min(0, state.dailyPnlUsd)) / state.currentPortfolioValueUsd) * 100;
    if (dailyLossPercent >= limits.dailyLossLimitPercent) {
      await activateKillSwitch(
        `daily loss limit breached: ${dailyLossPercent.toFixed(2)}% >= ${limits.dailyLossLimitPercent}%`,
        "system",
      );
      return true;
    }
  }

  // Portfolio drawdown breach.
  if (state.highWaterMarkUsd > 0) {
    const drawdownPercent =
      ((state.highWaterMarkUsd - state.currentPortfolioValueUsd) / state.highWaterMarkUsd) * 100;
    if (drawdownPercent >= limits.maxPortfolioDrawdownPercent) {
      await activateKillSwitch(
        `portfolio drawdown breached: ${drawdownPercent.toFixed(2)}% >= ${limits.maxPortfolioDrawdownPercent}%`,
        "system",
      );
      return true;
    }
  }

  // Consecutive loss limit.
  if (state.consecutiveLosses >= limits.consecutiveLossPause) {
    await activateKillSwitch(
      `consecutive loss pause triggered: ${state.consecutiveLosses} >= ${limits.consecutiveLossPause}`,
      "system",
    );
    return true;
  }

  return false;
}
