/**
 * Tests for the strategies gateway RPC handlers.
 *
 * Mocks the strategy registry and runner to validate CRUD,
 * toggle, execute, and history operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Hoisted mocks ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  listStrategies: vi.fn(),
  getStrategy: vi.fn(),
  saveStrategy: vi.fn(),
  deleteStrategy: vi.fn(),
  toggleStrategy: vi.fn(),
  listExecutions: vi.fn(),
  clearExecutions: vi.fn(),
  executeStrategy: vi.fn(),
  buildRunnerDeps: vi.fn(),
  tradingStateHandlers: {} as Record<string, unknown>,
}));

vi.mock("../../../trading/strategies/registry.js", () => ({
  listStrategies: mocks.listStrategies,
  getStrategy: mocks.getStrategy,
  saveStrategy: mocks.saveStrategy,
  deleteStrategy: mocks.deleteStrategy,
  toggleStrategy: mocks.toggleStrategy,
  listExecutions: mocks.listExecutions,
  clearExecutions: mocks.clearExecutions,
}));

vi.mock("../../../trading/strategies/runner.js", () => ({
  executeStrategy: mocks.executeStrategy,
}));

vi.mock("../../../trading/strategies/runner-deps.js", () => ({
  buildRunnerDeps: mocks.buildRunnerDeps,
}));

vi.mock("../trading-state.js", () => ({
  tradingStateHandlers: mocks.tradingStateHandlers,
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

const sampleStrategy = {
  id: "s1",
  name: "Mean Reversion",
  enabled: true,
  symbols: ["AAPL"],
};

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Import handlers (after mocks are registered) ─────────────────

const { strategiesHandlers } = await import("../strategies.js");

// ── strategies.list ──────────────────────────────────────────────

describe("strategies.list", () => {
  const handler = strategiesHandlers["strategies.list"];

  it("returns list of strategies", async () => {
    mocks.listStrategies.mockResolvedValue([sampleStrategy]);
    const { opts, respond } = makeOpts("strategies.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { strategies: [sampleStrategy] }, undefined);
  });

  it("returns empty list when no strategies exist", async () => {
    mocks.listStrategies.mockResolvedValue([]);
    const { opts, respond } = makeOpts("strategies.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { strategies: [] }, undefined);
  });

  it("returns error on registry failure", async () => {
    mocks.listStrategies.mockRejectedValue(new Error("disk error"));
    const { opts, respond } = makeOpts("strategies.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── strategies.get ───────────────────────────────────────────────

describe("strategies.get", () => {
  const handler = strategiesHandlers["strategies.get"];

  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("strategies.get", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("rejects when strategy not found", async () => {
    mocks.getStrategy.mockResolvedValue(null);
    const { opts, respond } = makeOpts("strategies.get", { id: "missing" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategy not found" }),
    );
  });

  it("returns found strategy", async () => {
    mocks.getStrategy.mockResolvedValue(sampleStrategy);
    const { opts, respond } = makeOpts("strategies.get", { id: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { strategy: sampleStrategy }, undefined);
  });
});

// ── strategies.save ──────────────────────────────────────────────

describe("strategies.save", () => {
  const handler = strategiesHandlers["strategies.save"];

  it("saves and returns the strategy", async () => {
    const input = { name: "New Strategy", symbols: ["BTC"] };
    const saved = { id: "s2", ...input, enabled: true };
    mocks.saveStrategy.mockResolvedValue(saved);

    const { opts, respond } = makeOpts("strategies.save", input);
    await handler(opts);
    expect(mocks.saveStrategy).toHaveBeenCalledWith(input);
    expect(respond).toHaveBeenCalledWith(true, { strategy: saved }, undefined);
  });

  it("returns error on save failure", async () => {
    mocks.saveStrategy.mockRejectedValue(new Error("validation failed"));
    const { opts, respond } = makeOpts("strategies.save", { name: "" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── strategies.delete ────────────────────────────────────────────

describe("strategies.delete", () => {
  const handler = strategiesHandlers["strategies.delete"];

  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("strategies.delete", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("deletes and returns result", async () => {
    mocks.deleteStrategy.mockResolvedValue(true);
    const { opts, respond } = makeOpts("strategies.delete", { id: "s1" });
    await handler(opts);
    expect(mocks.deleteStrategy).toHaveBeenCalledWith("s1");
    expect(respond).toHaveBeenCalledWith(true, { deleted: true }, undefined);
  });
});

// ── strategies.toggle ────────────────────────────────────────────

describe("strategies.toggle", () => {
  const handler = strategiesHandlers["strategies.toggle"];

  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("strategies.toggle", { enabled: true });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: "id and enabled (boolean) are required",
      }),
    );
  });

  it("rejects non-boolean enabled", async () => {
    const { opts, respond } = makeOpts("strategies.toggle", {
      id: "s1",
      enabled: "yes",
    });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: "id and enabled (boolean) are required",
      }),
    );
  });

  it("rejects when strategy not found", async () => {
    mocks.toggleStrategy.mockResolvedValue(null);
    const { opts, respond } = makeOpts("strategies.toggle", {
      id: "missing",
      enabled: false,
    });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategy not found" }),
    );
  });

  it("toggles and returns updated strategy", async () => {
    const toggled = { ...sampleStrategy, enabled: false };
    mocks.toggleStrategy.mockResolvedValue(toggled);
    const { opts, respond } = makeOpts("strategies.toggle", {
      id: "s1",
      enabled: false,
    });
    await handler(opts);
    expect(mocks.toggleStrategy).toHaveBeenCalledWith("s1", false);
    expect(respond).toHaveBeenCalledWith(true, { strategy: toggled }, undefined);
  });
});

// ── strategies.execute ───────────────────────────────────────────

describe("strategies.execute", () => {
  const handler = strategiesHandlers["strategies.execute"];

  it("rejects missing strategyId", async () => {
    const { opts, respond } = makeOpts("strategies.execute", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategyId is required" }),
    );
  });

  it("rejects when strategy not found", async () => {
    mocks.getStrategy.mockResolvedValue(null);
    const { opts, respond } = makeOpts("strategies.execute", { strategyId: "missing" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategy not found" }),
    );
  });

  it("rejects disabled strategy", async () => {
    mocks.getStrategy.mockResolvedValue({ ...sampleStrategy, enabled: false });
    const { opts, respond } = makeOpts("strategies.execute", { strategyId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategy is disabled" }),
    );
  });

  it("executes enabled strategy and returns result", async () => {
    mocks.getStrategy.mockResolvedValue(sampleStrategy);
    const execution = { id: "exec-1", status: "completed" };
    mocks.buildRunnerDeps.mockReturnValue({ rpc: vi.fn() });
    mocks.executeStrategy.mockResolvedValue(execution);

    const { opts, respond } = makeOpts("strategies.execute", { strategyId: "s1" });
    await handler(opts);

    expect(mocks.executeStrategy).toHaveBeenCalledWith("s1", expect.anything());
    expect(respond).toHaveBeenCalledWith(true, { execution }, undefined);
  });

  it("returns error on execution failure", async () => {
    mocks.getStrategy.mockResolvedValue(sampleStrategy);
    mocks.buildRunnerDeps.mockReturnValue({ rpc: vi.fn() });
    mocks.executeStrategy.mockRejectedValue(new Error("runner crashed"));

    const { opts, respond } = makeOpts("strategies.execute", { strategyId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── strategies.executions ────────────────────────────────────────

describe("strategies.executions", () => {
  const handler = strategiesHandlers["strategies.executions"];

  it("lists all executions when no strategyId given", async () => {
    const execs = [{ id: "e1" }, { id: "e2" }];
    mocks.listExecutions.mockResolvedValue(execs);
    const { opts, respond } = makeOpts("strategies.executions", {});
    await handler(opts);
    expect(mocks.listExecutions).toHaveBeenCalledWith(undefined);
    expect(respond).toHaveBeenCalledWith(true, { executions: execs }, undefined);
  });

  it("filters executions by strategyId", async () => {
    mocks.listExecutions.mockResolvedValue([{ id: "e1" }]);
    const { opts, respond } = makeOpts("strategies.executions", {
      strategyId: "s1",
    });
    await handler(opts);
    expect(mocks.listExecutions).toHaveBeenCalledWith("s1");
    expect(respond).toHaveBeenCalledWith(true, { executions: [{ id: "e1" }] }, undefined);
  });
});

// ── strategies.clearHistory ──────────────────────────────────────

describe("strategies.clearHistory", () => {
  const handler = strategiesHandlers["strategies.clearHistory"];

  it("rejects missing strategyId", async () => {
    const { opts, respond } = makeOpts("strategies.clearHistory", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategyId is required" }),
    );
  });

  it("clears executions and returns removed count", async () => {
    mocks.clearExecutions.mockResolvedValue(5);
    const { opts, respond } = makeOpts("strategies.clearHistory", {
      strategyId: "s1",
    });
    await handler(opts);
    expect(mocks.clearExecutions).toHaveBeenCalledWith("s1");
    expect(respond).toHaveBeenCalledWith(true, { removed: 5 }, undefined);
  });
});
