import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Redirect ~/.tigerpaw to a temp directory so tests don't touch real state.
// vi.hoisted runs at the same level as vi.mock (both are hoisted).
// ---------------------------------------------------------------------------

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/tp-int-${process.pid}-${Date.now()}`,
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    default: { ...actual, homedir: () => TEST_HOME },
  };
});

// Silence subsystem loggers during tests.
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { configureAuditLog, readAuditEntries, verifyAuditChain } from "./audit-log.js";
// Now import the real trading modules — they all resolve paths from os.homedir().
import { TradingPolicyEngine, type TradingPolicyConfig, type TradeOrder } from "./policy-engine.js";
import {
  savePolicyState,
  loadPolicyState,
  withPlatformPortfolio,
  withPlatformPositionCount,
  type TradingPolicyState,
} from "./policy-state.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const AUDIT_PATH = path.join(TEST_HOME, ".tigerpaw", "trading", "audit.jsonl");

function makeConfig(overrides: Partial<TradingPolicyConfig> = {}): TradingPolicyConfig {
  return {
    tier: "moderate",
    approvalMode: "auto",
    limits: {
      maxRiskPerTradePercent: 5,
      dailyLossLimitPercent: 5,
      maxPortfolioDrawdownPercent: 20,
      maxSinglePositionPercent: 10,
      maxTradesPerDay: 25,
      maxOpenPositions: 8,
      cooldownBetweenTradesMs: 0,
      consecutiveLossPause: 5,
      maxDailySpendUsd: 500,
      maxSingleTradeUsd: 100,
    },
    confirm: { timeoutMs: 60000, showNotification: true, timeoutAction: "deny" },
    manual: { timeoutMs: 300000, timeoutAction: "deny" },
    ...overrides,
  };
}

function makeOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    id: `order-${Date.now()}`,
    extensionId: "alpaca",
    symbol: "AAPL",
    side: "buy",
    quantity: 1,
    priceUsd: 50,
    notionalUsd: 50,
    orderType: "market",
    ...overrides,
  };
}

function emptyState(): TradingPolicyState {
  return {
    date: new Date().toISOString().slice(0, 10),
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 10_000,
    currentPortfolioValueUsd: 10_000,
    openPositionCount: 0,
    positionCountByPlatform: {},
    portfolioByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
    platformKillSwitches: {},
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  mkdirSync(path.join(TEST_HOME, ".tigerpaw", "trading"), { recursive: true });
});

afterAll(() => {
  try {
    rmSync(TEST_HOME, { recursive: true, force: true });
  } catch {
    /* ignore cleanup errors */
  }
});

// ---------------------------------------------------------------------------
// End-to-end order flow
// ---------------------------------------------------------------------------

describe("end-to-end order flow", () => {
  beforeEach(async () => {
    configureAuditLog({ filePath: AUDIT_PATH });
    await savePolicyState(emptyState());
  });

  it("approved order produces a valid audit chain", async () => {
    const engine = new TradingPolicyEngine(makeConfig());
    const order = makeOrder({ id: "approved-1", notionalUsd: 50, priceUsd: 50 });

    const decision = await engine.evaluateOrder(order);
    expect(decision.outcome).toBe("approved");
    expect(decision.approvalMode).toBe("auto");

    // Audit chain should be valid.
    const chain = await verifyAuditChain(AUDIT_PATH);
    expect(chain.valid).toBeGreaterThanOrEqual(1);
    expect(chain.brokenAt).toBeUndefined();
    expect(chain.hmacFailedAt).toBeUndefined();

    // The entry should be an auto_approved action.
    const entries = await readAuditEntries(AUDIT_PATH);
    const approved = entries.find((e) => e.action === "auto_approved");
    expect(approved).toBeDefined();
    expect(approved!.orderSnapshot?.id).toBe("approved-1");
  });

  it("denied order writes limit_exceeded audit entry", async () => {
    // Set daily spend close to limit so the order pushes it over.
    await savePolicyState({
      ...emptyState(),
      dailySpendUsd: 480,
    });

    const engine = new TradingPolicyEngine(makeConfig());
    const order = makeOrder({ id: "denied-1", notionalUsd: 50, priceUsd: 50 });

    const decision = await engine.evaluateOrder(order);
    expect(decision.outcome).toBe("denied");
    expect(decision.failedStep).toBe("daily_spend");

    const entries = await readAuditEntries(AUDIT_PATH);
    const denied = entries.find((e) => e.action === "limit_exceeded");
    expect(denied).toBeDefined();
    expect(denied!.extensionId).toBe("alpaca");
    expect(denied!.error).toContain("daily spend");
  });

  it("kill switch activated mid-session blocks subsequent orders", async () => {
    const engine = new TradingPolicyEngine(makeConfig());

    // First order: passes.
    const order1 = makeOrder({ id: "pre-kill-1" });
    const d1 = await engine.evaluateOrder(order1);
    expect(d1.outcome).toBe("approved");

    // Activate kill switch via policy state.
    await savePolicyState({
      ...emptyState(),
      killSwitch: {
        active: true,
        activatedAt: Date.now(),
        activatedBy: "system",
        reason: "daily loss limit breached",
      },
    });

    // Second order: should be denied by kill switch.
    const order2 = makeOrder({ id: "post-kill-1" });
    const d2 = await engine.evaluateOrder(order2);
    expect(d2.outcome).toBe("denied");
    expect(d2.failedStep).toBe("kill_switch");
    expect(d2.reason).toContain("kill switch active");
  });
});

// ---------------------------------------------------------------------------
// Cross-platform portfolio aggregation
// ---------------------------------------------------------------------------

describe("cross-platform portfolio aggregation", () => {
  it("aggregates portfolio value across multiple platforms", () => {
    let state = emptyState();
    const afterAlpaca = withPlatformPortfolio(state, "alpaca", 25_000);
    state = { ...state, ...afterAlpaca };
    const afterBinance = withPlatformPortfolio(state, "binance", 15_000);
    state = { ...state, ...afterBinance };
    const afterKraken = withPlatformPortfolio(state, "kraken", 10_000);

    expect(afterKraken.currentPortfolioValueUsd).toBe(50_000);
    expect(afterKraken.portfolioByPlatform).toEqual({
      alpaca: 25_000,
      binance: 15_000,
      kraken: 10_000,
    });
  });

  it("openPositionCount aggregates across platforms (regression)", () => {
    let state = emptyState();

    // Simulate Alpaca syncing 3 positions.
    const afterAlpaca = withPlatformPositionCount(state, "alpaca", 3);
    state = { ...state, ...afterAlpaca };

    // Simulate Binance syncing 5 positions.
    const afterBinance = withPlatformPositionCount(state, "binance", 5);
    state = { ...state, ...afterBinance };

    // Total should be 8, NOT the last-synced value of 5.
    expect(afterBinance.openPositionCount).toBe(8);
    expect(afterBinance.positionCountByPlatform).toEqual({
      alpaca: 3,
      binance: 5,
    });

    // Alpaca re-syncs with 1 position — total should update to 6.
    const afterResync = withPlatformPositionCount({ ...state, ...afterBinance }, "alpaca", 1);
    expect(afterResync.openPositionCount).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Daily reset behavior
// ---------------------------------------------------------------------------

describe("daily reset", () => {
  it("resets daily counters on date rollover but preserves persistent state", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // Save state with yesterday's date and non-zero daily counters.
    await savePolicyState({
      ...emptyState(),
      date: yesterday,
      dailyPnlUsd: -200,
      dailySpendUsd: 350,
      dailyTradeCount: 12,
      highWaterMarkUsd: 50_000,
      currentPortfolioValueUsd: 45_000,
      openPositionCount: 4,
      positionCountByPlatform: { alpaca: 2, binance: 2 },
      killSwitch: {
        active: true,
        activatedAt: Date.now() - 3600_000,
        activatedBy: "system",
        reason: "daily loss",
      },
    });

    // loadPolicyState applies date reset internally.
    const loaded = await loadPolicyState();

    // Daily counters should be reset.
    expect(loaded.dailyPnlUsd).toBe(0);
    expect(loaded.dailySpendUsd).toBe(0);
    expect(loaded.dailyTradeCount).toBe(0);
    expect(loaded.date).toBe(new Date().toISOString().slice(0, 10));

    // Persistent state should survive.
    expect(loaded.killSwitch.active).toBe(true);
    expect(loaded.highWaterMarkUsd).toBe(50_000);
    expect(loaded.currentPortfolioValueUsd).toBe(45_000);
    expect(loaded.openPositionCount).toBe(4);
    expect(loaded.positionCountByPlatform).toEqual({ alpaca: 2, binance: 2 });
  });
});
