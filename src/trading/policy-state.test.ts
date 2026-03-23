import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradingPolicyState } from "./policy-state.js";

// Mock file-lock to pass through without actually locking.
vi.mock("../plugin-sdk/file-lock.js", () => ({
  withFileLock: vi.fn(async (_filePath: string, _opts: unknown, fn: () => Promise<unknown>) =>
    fn(),
  ),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/**
 * The module computes STATE_DIR at load time from os.homedir().
 * The global test setup (test/setup.ts) already redirects HOME to a temp dir
 * before any imports, so os.homedir() returns the isolated temp path. We
 * dynamically import the module under test so that the STATE_DIR constant
 * picks up the redirected HOME.
 */

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function stateDir(): string {
  return path.join(os.homedir(), ".tigerpaw", "trading");
}

function stateFile(): string {
  return path.join(stateDir(), "policy-state.json");
}

function createSampleState(overrides: Partial<TradingPolicyState> = {}): TradingPolicyState {
  return {
    date: todayUtc(),
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 10_000,
    currentPortfolioValueUsd: 10_000,
    openPositionCount: 0,
    positionCountByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
    ...overrides,
  };
}

describe("policy-state", () => {
  // We dynamically import to ensure the module-level STATE_DIR picks up
  // the test-isolated HOME set by test/setup.ts.
  let loadPolicyState: typeof import("./policy-state.js").loadPolicyState;
  let savePolicyState: typeof import("./policy-state.js").savePolicyState;
  let updatePolicyState: typeof import("./policy-state.js").updatePolicyState;

  beforeEach(async () => {
    // Clear module cache so each test gets fresh STATE_DIR computation.
    vi.resetModules();
    const mod = await import("./policy-state.js");
    loadPolicyState = mod.loadPolicyState;
    savePolicyState = mod.savePolicyState;
    updatePolicyState = mod.updatePolicyState;

    // Ensure the state dir is clean before each test.
    await fs.rm(stateDir(), { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(stateDir(), { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // loadPolicyState
  // ---------------------------------------------------------------------------
  describe("loadPolicyState", () => {
    it("returns empty state when file does not exist", async () => {
      const state = await loadPolicyState();

      expect(state.date).toBe(todayUtc());
      expect(state.dailyPnlUsd).toBe(0);
      expect(state.dailySpendUsd).toBe(0);
      expect(state.dailyTradeCount).toBe(0);
      expect(state.consecutiveLosses).toBe(0);
      expect(state.highWaterMarkUsd).toBe(0);
      expect(state.currentPortfolioValueUsd).toBe(0);
      expect(state.openPositionCount).toBe(0);
      expect(state.positionsByAsset).toEqual({});
      expect(state.lastTradeAtMs).toBe(0);
      expect(state.killSwitch).toEqual({ active: false });
    });

    it("returns parsed state when file exists with today's date", async () => {
      const existing = createSampleState({
        dailyPnlUsd: 42,
        dailySpendUsd: 100,
        dailyTradeCount: 3,
        consecutiveLosses: 1,
        highWaterMarkUsd: 15_000,
      });

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(existing), "utf8");

      const state = await loadPolicyState();

      expect(state.date).toBe(todayUtc());
      expect(state.dailyPnlUsd).toBe(42);
      expect(state.dailySpendUsd).toBe(100);
      expect(state.dailyTradeCount).toBe(3);
      expect(state.consecutiveLosses).toBe(1);
      expect(state.highWaterMarkUsd).toBe(15_000);
    });

    it("resets daily counters when date differs from today", async () => {
      const yesterday = "2020-01-01";
      const existing = createSampleState({
        date: yesterday,
        dailyPnlUsd: -50,
        dailySpendUsd: 200,
        dailyTradeCount: 5,
        consecutiveLosses: 3,
        highWaterMarkUsd: 20_000,
        killSwitch: { active: true, reason: "manual" },
        positionsByAsset: {
          AAPL: { extensionId: "alpaca", valueUsd: 500, percentOfPortfolio: 5 },
        },
      });

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(existing), "utf8");

      const state = await loadPolicyState();

      // Daily counters are reset.
      expect(state.date).toBe(todayUtc());
      expect(state.dailyPnlUsd).toBe(0);
      expect(state.dailySpendUsd).toBe(0);
      expect(state.dailyTradeCount).toBe(0);

      // Non-daily state is preserved.
      expect(state.consecutiveLosses).toBe(3);
      expect(state.highWaterMarkUsd).toBe(20_000);
      expect(state.killSwitch).toEqual({ active: true, reason: "manual" });
      expect(state.positionsByAsset).toEqual({
        AAPL: { extensionId: "alpaca", valueUsd: 500, percentOfPortfolio: 5 },
      });
    });

    it("returns empty state on corrupt JSON", async () => {
      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), "this is not valid json!!!", "utf8");

      const state = await loadPolicyState();

      expect(state.date).toBe(todayUtc());
      expect(state.dailyPnlUsd).toBe(0);
      expect(state.dailyTradeCount).toBe(0);
    });

    it("returns empty state when date field is not a string (sanity check)", async () => {
      const malformed = { ...createSampleState(), date: 12345 };

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(malformed), "utf8");

      const state = await loadPolicyState();

      expect(state.date).toBe(todayUtc());
      expect(state.dailyPnlUsd).toBe(0);
    });

    it("returns empty state when dailyPnlUsd is not a number (sanity check)", async () => {
      const malformed = { ...createSampleState(), dailyPnlUsd: "not-a-number" };

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(malformed), "utf8");

      const state = await loadPolicyState();

      expect(state.date).toBe(todayUtc());
      expect(state.dailyPnlUsd).toBe(0);
    });

    it("does not reset daily counters when date matches today", async () => {
      const existing = createSampleState({
        dailyPnlUsd: 100,
        dailySpendUsd: 50,
        dailyTradeCount: 7,
      });

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(existing), "utf8");

      const state = await loadPolicyState();

      expect(state.dailyPnlUsd).toBe(100);
      expect(state.dailySpendUsd).toBe(50);
      expect(state.dailyTradeCount).toBe(7);
    });
  });

  // ---------------------------------------------------------------------------
  // savePolicyState
  // ---------------------------------------------------------------------------
  describe("savePolicyState", () => {
    it("writes state to disk as formatted JSON", async () => {
      const state = createSampleState({ dailyPnlUsd: 77 });

      await savePolicyState(state);

      const raw = await fs.readFile(stateFile(), "utf8");
      const parsed = JSON.parse(raw) as TradingPolicyState;
      expect(parsed.dailyPnlUsd).toBe(77);
      expect(parsed.date).toBe(todayUtc());
    });

    it("creates state directory if it does not exist", async () => {
      // Ensure dir does not exist before save.
      await fs.rm(stateDir(), { recursive: true, force: true });

      const state = createSampleState();
      await savePolicyState(state);

      const stat = await fs.stat(stateFile());
      expect(stat.isFile()).toBe(true);
    });

    it("sets file permissions to 0o600", async () => {
      const state = createSampleState();
      await savePolicyState(state);

      const stat = await fs.stat(stateFile());
      // 0o600 = owner read/write only = 0o100600 on files (33152 decimal).
      // The mode includes the file type bits, so mask with 0o777.
      const permissions = stat.mode & 0o777;
      expect(permissions).toBe(0o600);
    });

    it("uses atomic write (tmp file + rename)", async () => {
      const state = createSampleState({ dailyTradeCount: 42 });
      await savePolicyState(state);

      // Verify the tmp file is cleaned up (renamed away).
      const tmpExists = await fs
        .access(`${stateFile()}.tmp`)
        .then(() => true)
        .catch(() => false);
      expect(tmpExists).toBe(false);

      // The final file should exist with correct content.
      const raw = await fs.readFile(stateFile(), "utf8");
      const parsed = JSON.parse(raw) as TradingPolicyState;
      expect(parsed.dailyTradeCount).toBe(42);
    });

    it("overwrites existing state on subsequent saves", async () => {
      await savePolicyState(createSampleState({ dailyPnlUsd: 10 }));
      await savePolicyState(createSampleState({ dailyPnlUsd: 20 }));

      const raw = await fs.readFile(stateFile(), "utf8");
      const parsed = JSON.parse(raw) as TradingPolicyState;
      expect(parsed.dailyPnlUsd).toBe(20);
    });
  });

  // ---------------------------------------------------------------------------
  // updatePolicyState
  // ---------------------------------------------------------------------------
  describe("updatePolicyState", () => {
    it("loads, applies mutation, and saves atomically", async () => {
      // Seed initial state.
      await savePolicyState(createSampleState({ dailyTradeCount: 3 }));

      const result = await updatePolicyState((s) => ({
        ...s,
        dailyTradeCount: s.dailyTradeCount + 1,
      }));

      expect(result.dailyTradeCount).toBe(4);

      // Verify persisted.
      const raw = await fs.readFile(stateFile(), "utf8");
      const persisted = JSON.parse(raw) as TradingPolicyState;
      expect(persisted.dailyTradeCount).toBe(4);
    });

    it("starts from empty state when file is missing", async () => {
      const result = await updatePolicyState((s) => ({
        ...s,
        dailyPnlUsd: 999,
      }));

      expect(result.dailyPnlUsd).toBe(999);
      expect(result.date).toBe(todayUtc());

      // Verify persisted.
      const raw = await fs.readFile(stateFile(), "utf8");
      const persisted = JSON.parse(raw) as TradingPolicyState;
      expect(persisted.dailyPnlUsd).toBe(999);
    });

    it("applies daily reset before mutation when date differs", async () => {
      const staleState = createSampleState({
        date: "2020-06-15",
        dailyTradeCount: 10,
        dailyPnlUsd: -50,
        dailySpendUsd: 200,
        consecutiveLosses: 4,
        highWaterMarkUsd: 30_000,
      });

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(staleState), "utf8");

      const result = await updatePolicyState((s) => ({
        ...s,
        dailyTradeCount: s.dailyTradeCount + 1,
      }));

      // dailyTradeCount was reset to 0 (date mismatch), then incremented by 1.
      expect(result.dailyTradeCount).toBe(1);
      expect(result.dailyPnlUsd).toBe(0);
      expect(result.dailySpendUsd).toBe(0);
      // Non-daily fields preserved.
      expect(result.consecutiveLosses).toBe(4);
      expect(result.highWaterMarkUsd).toBe(30_000);
    });

    it("returns the mutated state", async () => {
      const result = await updatePolicyState((s) => ({
        ...s,
        killSwitch: { active: true, reason: "test" },
      }));

      expect(result.killSwitch).toEqual({ active: true, reason: "test" });
    });

    it("resets to empty state when existing file has invalid structure", async () => {
      const malformed = { date: 999, dailyPnlUsd: "bad" };

      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), JSON.stringify(malformed), "utf8");

      const result = await updatePolicyState((s) => ({
        ...s,
        dailyPnlUsd: 123,
      }));

      expect(result.dailyPnlUsd).toBe(123);
      expect(result.date).toBe(todayUtc());
    });

    it("handles corrupt JSON in existing file gracefully", async () => {
      await fs.mkdir(stateDir(), { recursive: true });
      await fs.writeFile(stateFile(), "{{{{broken json", "utf8");

      const result = await updatePolicyState((s) => ({
        ...s,
        consecutiveLosses: 7,
      }));

      expect(result.consecutiveLosses).toBe(7);
      expect(result.date).toBe(todayUtc());
    });

    it("sets file permissions to 0o600 on written file", async () => {
      await updatePolicyState((s) => s);

      const stat = await fs.stat(stateFile());
      const permissions = stat.mode & 0o777;
      expect(permissions).toBe(0o600);
    });
  });
});
