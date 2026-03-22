import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  /** Number of currently open positions. */
  openPositionCount: number;
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
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
  };
}

/**
 * Reset daily counters if the stored date differs from today (UTC midnight rollover).
 * Preserves non-daily state such as kill switch, high-water mark, and positions.
 */
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

/**
 * Load trading policy state from disk. Returns a fresh state on first run or
 * when the state file is missing/corrupt. Daily counters are automatically
 * reset at UTC midnight.
 */
export async function loadPolicyState(): Promise<TradingPolicyState> {
  await fs.mkdir(STATE_DIR, { recursive: true });

  return withFileLock(STATE_FILE, LOCK_OPTIONS, async () => {
    try {
      const raw = await fs.readFile(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw) as TradingPolicyState;

      // Structural sanity check on the loaded state.
      if (typeof parsed.date !== "string" || typeof parsed.dailyPnlUsd !== "number") {
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
 * Atomically persist trading policy state to disk.
 */
export async function savePolicyState(state: TradingPolicyState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });

  await withFileLock(STATE_FILE, LOCK_OPTIONS, async () => {
    const tmpPath = `${STATE_FILE}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmpPath, STATE_FILE);
    await fs.chmod(STATE_FILE, 0o600);
  });
}

/**
 * Load, apply a mutation function, and save the state atomically.
 * Returns the mutated state.
 */
export async function updatePolicyState(
  mutate: (state: TradingPolicyState) => TradingPolicyState,
): Promise<TradingPolicyState> {
  await fs.mkdir(STATE_DIR, { recursive: true });

  return withFileLock(STATE_FILE, LOCK_OPTIONS, async () => {
    let state: TradingPolicyState;
    try {
      const raw = await fs.readFile(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw) as TradingPolicyState;
      if (typeof parsed.date !== "string" || typeof parsed.dailyPnlUsd !== "number") {
        state = createEmptyState();
      } else {
        state = applyDateReset(parsed);
      }
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
