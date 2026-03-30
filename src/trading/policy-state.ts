import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dalIsTradingStateAvailable,
  dalLoadPolicyStateJson,
  dalSavePolicyStateJson,
} from "../dal/trading-state.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { withFileLock } from "../plugin-sdk/file-lock.js";

const log = createSubsystemLogger("trading/policy-state");

const STATE_DIR = path.join(os.homedir(), ".tigerpaw", "trading");
const STATE_FILE = path.join(STATE_DIR, "policy-state.json");

const LOCK_OPTIONS = {
  retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
  stale: 10_000,
};

export type TradingPolicyState = {
  /** UTC date string (YYYY-MM-DD) for daily counter resets. */
  date: string;
  /** Cumulative realized P&L for the current day in USD. */
  dailyPnlUsd: number;
  /** Cumulative notional spend for the current day in USD. */
  dailySpendUsd: number;
  /** Number of trades executed today. */
  dailyTradeCount: number;
  /** Running count of consecutive losing trades. */
  consecutiveLosses: number;
  /** Portfolio high-water mark in USD (for drawdown calculation). */
  highWaterMarkUsd: number;
  /** Current portfolio value in USD. */
  currentPortfolioValueUsd: number;
  /** Number of currently open positions (aggregated from all platforms). */
  openPositionCount: number;
  /** Per-platform position count breakdown (keyed by extensionId). */
  positionCountByPlatform: Record<string, number>;
  /** Per-platform portfolio value breakdown (keyed by extensionId). */
  portfolioByPlatform: Record<string, number>;
  /** Per-asset position tracking. */
  positionsByAsset: Record<
    string,
    {
      extensionId: string;
      valueUsd: number;
      percentOfPortfolio: number;
    }
  >;
  /** Timestamp (ms) of the last executed trade. */
  lastTradeAtMs: number;
  /** Kill switch state. */
  killSwitch: {
    active: boolean;
    activatedAt?: number;
    activatedBy?: string;
    reason?: string;
  };
  /** Per-platform kill switches (keyed by extensionId). */
  platformKillSwitches: Record<
    string,
    {
      active: boolean;
      activatedAt?: number;
      activatedBy?: string;
      reason?: string;
    }
  >;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyState(): TradingPolicyState {
  return {
    date: todayUtc(),
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 0,
    currentPortfolioValueUsd: 0,
    openPositionCount: 0,
    positionCountByPlatform: {},
    portfolioByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
    platformKillSwitches: {},
  };
}

function applyDateReset(state: TradingPolicyState): TradingPolicyState {
  const today = todayUtc();
  if (state.date === today) {
    return state;
  }
  log.info(`daily counter reset: ${state.date} -> ${today}`);
  return {
    ...state,
    date: today,
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
  };
}

function parseState(raw: string): TradingPolicyState | null {
  try {
    const parsed = JSON.parse(raw) as TradingPolicyState;
    if (typeof parsed.date !== "string" || typeof parsed.dailyPnlUsd !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Load trading policy state. Uses SQLite when available, falls back to file.
 */
export async function loadPolicyState(): Promise<TradingPolicyState> {
  if (dalIsTradingStateAvailable()) {
    const json = dalLoadPolicyStateJson();
    if (json) {
      const parsed = parseState(json);
      return parsed ? applyDateReset(parsed) : createEmptyState();
    }
    return createEmptyState();
  }

  // Legacy file-based path
  await fs.mkdir(STATE_DIR, { recursive: true });

  return withFileLock(STATE_FILE, LOCK_OPTIONS, async () => {
    try {
      const raw = await fs.readFile(STATE_FILE, "utf8");
      const parsed = parseState(raw);
      if (!parsed) {
        log.warn("policy state file has unexpected shape, resetting");
        return createEmptyState();
      }
      return applyDateReset(parsed);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "ENOENT") {
        log.warn(`failed to read policy state, resetting: ${String(err)}`);
      }
      return createEmptyState();
    }
  });
}

/**
 * Persist trading policy state. Uses SQLite when available, falls back to file.
 */
export async function savePolicyState(state: TradingPolicyState): Promise<void> {
  if (dalIsTradingStateAvailable()) {
    dalSavePolicyStateJson(JSON.stringify(state, null, 2));
    return;
  }

  // Legacy file-based path
  await fs.mkdir(STATE_DIR, { recursive: true });

  await withFileLock(STATE_FILE, LOCK_OPTIONS, async () => {
    const tmpPath = `${STATE_FILE}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmpPath, STATE_FILE);
    await fs.chmod(STATE_FILE, 0o600);
  });
}

/**
 * Build a state update that sets a single platform's portfolio value and
 * recomputes the aggregate `currentPortfolioValueUsd` from all platforms.
 */
export function withPlatformPortfolio(
  state: TradingPolicyState,
  extensionId: string,
  valueUsd: number,
): Pick<TradingPolicyState, "portfolioByPlatform" | "currentPortfolioValueUsd"> {
  const updated = { ...state.portfolioByPlatform, [extensionId]: valueUsd };
  const total = Object.values(updated).reduce((sum, v) => sum + v, 0);
  return { portfolioByPlatform: updated, currentPortfolioValueUsd: total };
}

/**
 * Build a state update that sets a single platform's position count and
 * recomputes the aggregate `openPositionCount` from all platforms.
 */
export function withPlatformPositionCount(
  state: TradingPolicyState,
  extensionId: string,
  count: number,
): Pick<TradingPolicyState, "positionCountByPlatform" | "openPositionCount"> {
  const updated = { ...state.positionCountByPlatform, [extensionId]: count };
  const total = Object.values(updated).reduce((sum, v) => sum + v, 0);
  return { positionCountByPlatform: updated, openPositionCount: total };
}

/**
 * Load, apply a mutation function, and save the state atomically.
 */
export async function updatePolicyState(
  mutate: (state: TradingPolicyState) => TradingPolicyState,
): Promise<TradingPolicyState> {
  if (dalIsTradingStateAvailable()) {
    const json = dalLoadPolicyStateJson();
    let state: TradingPolicyState;
    if (json) {
      const parsed = parseState(json);
      state = parsed ? applyDateReset(parsed) : createEmptyState();
    } else {
      state = createEmptyState();
    }
    const updated = mutate(state);
    dalSavePolicyStateJson(JSON.stringify(updated, null, 2));
    return updated;
  }

  // Legacy file-based path
  await fs.mkdir(STATE_DIR, { recursive: true });

  return withFileLock(STATE_FILE, LOCK_OPTIONS, async () => {
    let state: TradingPolicyState;
    try {
      const raw = await fs.readFile(STATE_FILE, "utf8");
      const parsed = parseState(raw);
      state = parsed ? applyDateReset(parsed) : createEmptyState();
    } catch {
      state = createEmptyState();
    }

    const updated = mutate(state);
    const tmpPath = `${STATE_FILE}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(updated, null, 2), "utf8");
    await fs.rename(tmpPath, STATE_FILE);
    await fs.chmod(STATE_FILE, 0o600);
    return updated;
  });
}
