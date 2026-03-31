import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyDefinition, StrategyExecution } from "./types.js";

// Mock file-lock to pass through without actually locking.
vi.mock("../../plugin-sdk/file-lock.js", () => ({
  withFileLock: vi.fn(async (_filePath: string, _opts: unknown, fn: () => Promise<unknown>) =>
    fn(),
  ),
}));

vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// In-memory file store for readFile / writeJsonAtomic
let fileStore: Map<string, string>;

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string) => {
    const data = fileStore.get(p);
    if (data === undefined) {
      throw new Error("ENOENT");
    }
    return data;
  }),
}));

vi.mock("../../infra/json-files.js", () => ({
  writeJsonAtomic: vi.fn(async (p: string, data: unknown) => {
    fileStore.set(p, JSON.stringify(data));
  }),
}));

function makeInput(
  overrides: Partial<StrategyDefinition> = {},
): Omit<
  StrategyDefinition,
  "id" | "createdAt" | "updatedAt" | "version" | "totalTrades" | "winRate" | "totalPnlUsd"
> {
  return {
    name: "Test Strategy",
    description: "A strategy for testing",
    enabled: true,
    symbols: ["AAPL"],
    extensionId: "ext-1",
    signals: [],
    entryRule: { minSignalStrength: 0.5, orderType: "market" },
    exitRule: { stopLossPercent: 5 },
    positionSizing: {
      method: "fixed_usd",
      fixedUsd: 1000,
      maxPositionPercent: 25,
    },
    schedule: "continuous",
    ...overrides,
  };
}

function makeExecution(overrides: Partial<StrategyExecution> = {}): StrategyExecution {
  return {
    id: "exec-1",
    strategyId: "strat-1",
    startedAt: new Date().toISOString(),
    status: "completed",
    signalResults: [],
    ordersSubmitted: 1,
    pnlUsd: 10,
    ...overrides,
  };
}

let mod: typeof import("./registry.js");

beforeEach(async () => {
  fileStore = new Map();
  vi.clearAllMocks();
  mod = await import("./registry.js");
});

afterEach(() => {
  vi.resetModules();
});

// ---------- listStrategies --------------------------------------------------

describe("listStrategies", () => {
  it("returns empty array when no file exists", async () => {
    const list = await mod.listStrategies();
    expect(list).toEqual([]);
  });

  it("returns strategies from file", async () => {
    const saved = await mod.saveStrategy(makeInput({ name: "Alpha" }));
    const list = await mod.listStrategies();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Alpha");
    expect(list[0].id).toBe(saved.id);
  });

  it("returns multiple strategies", async () => {
    await mod.saveStrategy(makeInput({ name: "A" }));
    await mod.saveStrategy(makeInput({ name: "B" }));
    const list = await mod.listStrategies();
    expect(list).toHaveLength(2);
  });
});

// ---------- getStrategy -----------------------------------------------------

describe("getStrategy", () => {
  it("returns undefined for non-existent id", async () => {
    const s = await mod.getStrategy("does-not-exist");
    expect(s).toBeUndefined();
  });

  it("finds strategy by id", async () => {
    const saved = await mod.saveStrategy(makeInput({ name: "Finder" }));
    const found = await mod.getStrategy(saved.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Finder");
  });
});

// ---------- saveStrategy ----------------------------------------------------

describe("saveStrategy", () => {
  it("creates a new strategy with generated fields", async () => {
    const s = await mod.saveStrategy(makeInput({ name: "New" }));
    expect(s.id).toBeTruthy();
    expect(s.version).toBe(1);
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.totalPnlUsd).toBe(0);
    expect(s.createdAt).toBeTruthy();
    expect(s.updatedAt).toBeTruthy();
  });

  it("updates an existing strategy and increments version", async () => {
    const created = await mod.saveStrategy(makeInput({ name: "V1" }));
    const updated = await mod.saveStrategy({
      ...makeInput({ name: "V2" }),
      id: created.id,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.version).toBe(2);
    expect(updated.name).toBe("V2");
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it("preserves performance fields on update", async () => {
    const s = await mod.saveStrategy(makeInput());
    await mod.updateStrategyPerformance(s.id, {
      totalTrades: 10,
      winRate: 60,
      totalPnlUsd: 500,
      lastExecutedAt: new Date().toISOString(),
    });
    const updated = await mod.saveStrategy({
      ...makeInput({ name: "Updated" }),
      id: s.id,
    });
    expect(updated.totalTrades).toBe(10);
    expect(updated.winRate).toBe(60);
    expect(updated.totalPnlUsd).toBe(500);
  });

  it("does not overwrite other strategies when creating", async () => {
    await mod.saveStrategy(makeInput({ name: "Existing" }));
    await mod.saveStrategy(makeInput({ name: "New One" }));
    const all = await mod.listStrategies();
    expect(all).toHaveLength(2);
  });

  it("uses provided id when creating", async () => {
    const s = await mod.saveStrategy({
      ...makeInput({ name: "Specified" }),
      id: "custom-id-123",
    });
    expect(s.id).toBe("custom-id-123");
    expect(s.version).toBe(1);
  });
});

// ---------- deleteStrategy --------------------------------------------------

describe("deleteStrategy", () => {
  it("returns false when strategy does not exist", async () => {
    const deleted = await mod.deleteStrategy("ghost");
    expect(deleted).toBe(false);
  });

  it("removes the strategy and returns true", async () => {
    const s = await mod.saveStrategy(makeInput());
    const deleted = await mod.deleteStrategy(s.id);
    expect(deleted).toBe(true);
    const found = await mod.getStrategy(s.id);
    expect(found).toBeUndefined();
  });

  it("does not affect other strategies", async () => {
    const a = await mod.saveStrategy(makeInput({ name: "Keep" }));
    const b = await mod.saveStrategy(makeInput({ name: "Remove" }));
    await mod.deleteStrategy(b.id);
    const list = await mod.listStrategies();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a.id);
  });
});

// ---------- toggleStrategy --------------------------------------------------

describe("toggleStrategy", () => {
  it("returns undefined for non-existent strategy", async () => {
    const result = await mod.toggleStrategy("nope", true);
    expect(result).toBeUndefined();
  });

  it("enables a disabled strategy", async () => {
    const s = await mod.saveStrategy(makeInput({ enabled: false }));
    const toggled = await mod.toggleStrategy(s.id, true);
    expect(toggled!.enabled).toBe(true);
  });

  it("disables an enabled strategy", async () => {
    const s = await mod.saveStrategy(makeInput({ enabled: true }));
    const toggled = await mod.toggleStrategy(s.id, false);
    expect(toggled!.enabled).toBe(false);
  });

  it("updates the updatedAt timestamp", async () => {
    const s = await mod.saveStrategy(makeInput());
    // toggleStrategy always sets updatedAt to a new Date().toISOString()
    const toggled = await mod.toggleStrategy(s.id, false);
    expect(toggled!.updatedAt).toBeTruthy();
    // The updatedAt should be a valid ISO string
    expect(new Date(toggled!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(s.createdAt).getTime(),
    );
  });
});

// ---------- updateStrategyPerformance ---------------------------------------

describe("updateStrategyPerformance", () => {
  it("updates performance fields on existing strategy", async () => {
    const s = await mod.saveStrategy(makeInput());
    const now = new Date().toISOString();
    await mod.updateStrategyPerformance(s.id, {
      totalTrades: 42,
      winRate: 75,
      totalPnlUsd: 1234.56,
      lastExecutedAt: now,
    });
    const found = await mod.getStrategy(s.id);
    expect(found!.totalTrades).toBe(42);
    expect(found!.winRate).toBe(75);
    expect(found!.totalPnlUsd).toBeCloseTo(1234.56);
  });

  it("does nothing if strategy does not exist", async () => {
    // Should not throw
    await expect(
      mod.updateStrategyPerformance("ghost", {
        totalTrades: 1,
        winRate: 50,
        totalPnlUsd: 0,
        lastExecutedAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------- listExecutions --------------------------------------------------

describe("listExecutions", () => {
  it("returns empty array when no executions", async () => {
    const list = await mod.listExecutions();
    expect(list).toEqual([]);
  });

  it("returns all executions when no strategyId filter", async () => {
    await mod.recordExecution(makeExecution({ id: "e1", strategyId: "s1" }));
    await mod.recordExecution(makeExecution({ id: "e2", strategyId: "s2" }));
    const list = await mod.listExecutions();
    expect(list).toHaveLength(2);
  });

  it("filters by strategyId", async () => {
    await mod.recordExecution(makeExecution({ id: "e1", strategyId: "s1" }));
    await mod.recordExecution(makeExecution({ id: "e2", strategyId: "s2" }));
    const filtered = await mod.listExecutions("s1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].strategyId).toBe("s1");
  });
});

// ---------- recordExecution -------------------------------------------------

describe("recordExecution", () => {
  it("adds a new execution", async () => {
    const exec = makeExecution({ id: "new-exec" });
    await mod.recordExecution(exec);
    const list = await mod.listExecutions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("new-exec");
  });

  it("updates an existing execution by id", async () => {
    const exec = makeExecution({ id: "upd-exec", status: "running" });
    await mod.recordExecution(exec);
    const updated = { ...exec, status: "completed" as const };
    await mod.recordExecution(updated);
    const list = await mod.listExecutions();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("completed");
  });

  it("caps at 500 executions", async () => {
    for (let i = 0; i < 510; i++) {
      await mod.recordExecution(makeExecution({ id: `exec-${i}`, strategyId: "s1" }));
    }
    const list = await mod.listExecutions();
    expect(list.length).toBeLessThanOrEqual(500);
  });
});

// ---------- clearExecutions -------------------------------------------------

describe("clearExecutions", () => {
  it("returns 0 when nothing to clear", async () => {
    const removed = await mod.clearExecutions("unknown");
    expect(removed).toBe(0);
  });

  it("removes executions for given strategyId", async () => {
    await mod.recordExecution(makeExecution({ id: "e1", strategyId: "s1" }));
    await mod.recordExecution(makeExecution({ id: "e2", strategyId: "s1" }));
    await mod.recordExecution(makeExecution({ id: "e3", strategyId: "s2" }));
    const removed = await mod.clearExecutions("s1");
    expect(removed).toBe(2);
    const remaining = await mod.listExecutions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].strategyId).toBe("s2");
  });
});
