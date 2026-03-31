import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGatewayRpc = vi.fn();
vi.mock("@/lib/gateway-rpc", () => ({
  gatewayRpc: (...args: unknown[]) => mockGatewayRpc(...args),
}));

// Import store AFTER mocks
const { useStrategyStore } = await import("../strategy-store");
type BacktestResult = Awaited<typeof import("../strategy-store")>["BacktestResult"];
const initialState = useStrategyStore.getState();

beforeEach(() => {
  useStrategyStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe("strategy-store", () => {
  // --- Initial state ---
  describe("initial state", () => {
    it("strategies is empty", () => {
      expect(useStrategyStore.getState().strategies).toEqual([]);
    });

    it("executions is empty", () => {
      expect(useStrategyStore.getState().executions).toEqual([]);
    });

    it("selectedStrategyId is null", () => {
      expect(useStrategyStore.getState().selectedStrategyId).toBeNull();
    });

    it("backtestResult is null", () => {
      expect(useStrategyStore.getState().backtestResult).toBeNull();
    });

    it("backtestRunning is false", () => {
      expect(useStrategyStore.getState().backtestRunning).toBe(false);
    });

    it("loading is false", () => {
      expect(useStrategyStore.getState().loading).toBe(false);
    });

    it("error is null", () => {
      expect(useStrategyStore.getState().error).toBeNull();
    });

    it("demoMode is false", () => {
      expect(useStrategyStore.getState().demoMode).toBe(false);
    });
  });

  // --- setDemoMode ---
  describe("setDemoMode", () => {
    it("enable populates demo strategies", () => {
      useStrategyStore.getState().setDemoMode(true);
      const s = useStrategyStore.getState();
      expect(s.demoMode).toBe(true);
      expect(s.strategies.length).toBe(3);
      expect(s.strategies[0].id).toBe("demo-momentum-1");
    });

    it("enable populates demo executions", () => {
      useStrategyStore.getState().setDemoMode(true);
      expect(useStrategyStore.getState().executions.length).toBe(4);
    });

    it("enable resets selectedStrategyId and backtestResult", () => {
      useStrategyStore.setState({
        selectedStrategyId: "some-id",
        backtestResult: {} as unknown as BacktestResult,
      });
      useStrategyStore.getState().setDemoMode(true);
      const s = useStrategyStore.getState();
      expect(s.selectedStrategyId).toBeNull();
      expect(s.backtestResult).toBeNull();
    });

    it("disable clears strategies and executions", () => {
      useStrategyStore.getState().setDemoMode(true);
      useStrategyStore.getState().setDemoMode(false);
      const s = useStrategyStore.getState();
      expect(s.demoMode).toBe(false);
      expect(s.strategies).toEqual([]);
      expect(s.executions).toEqual([]);
    });
  });

  // --- selectStrategy ---
  describe("selectStrategy", () => {
    it("sets selectedStrategyId", () => {
      useStrategyStore.getState().selectStrategy("strat-1");
      expect(useStrategyStore.getState().selectedStrategyId).toBe("strat-1");
    });

    it("clears backtestResult when selecting", () => {
      useStrategyStore.setState({ backtestResult: {} as unknown as BacktestResult });
      useStrategyStore.getState().selectStrategy("strat-1");
      expect(useStrategyStore.getState().backtestResult).toBeNull();
    });

    it("can set to null", () => {
      useStrategyStore.getState().selectStrategy("strat-1");
      useStrategyStore.getState().selectStrategy(null);
      expect(useStrategyStore.getState().selectedStrategyId).toBeNull();
    });
  });

  // --- clearBacktest ---
  describe("clearBacktest", () => {
    it("sets backtestResult to null", () => {
      useStrategyStore.setState({ backtestResult: { id: "bt-1" } as unknown as BacktestResult });
      useStrategyStore.getState().clearBacktest();
      expect(useStrategyStore.getState().backtestResult).toBeNull();
    });
  });

  // --- fetchStrategies ---
  describe("fetchStrategies", () => {
    it("sets loading true then false", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { strategies: [] } });
      const p = useStrategyStore.getState().fetchStrategies();
      expect(useStrategyStore.getState().loading).toBe(true);
      await p;
      expect(useStrategyStore.getState().loading).toBe(false);
    });

    it("updates strategies on success", async () => {
      const fakeList = [{ id: "s1", name: "Strat1" }];
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { strategies: fakeList } });
      await useStrategyStore.getState().fetchStrategies();
      expect(useStrategyStore.getState().strategies).toEqual(fakeList);
    });

    it("sets error on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("Network down"));
      await useStrategyStore.getState().fetchStrategies();
      expect(useStrategyStore.getState().error).toBe("Error: Network down");
      expect(useStrategyStore.getState().loading).toBe(false);
    });
  });

  // --- fetchExecutions ---
  describe("fetchExecutions", () => {
    it("updates executions on success", async () => {
      const fakeExecs = [{ id: "e1", strategyId: "s1" }];
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { executions: fakeExecs } });
      await useStrategyStore.getState().fetchExecutions("s1");
      expect(useStrategyStore.getState().executions).toEqual(fakeExecs);
      expect(mockGatewayRpc).toHaveBeenCalledWith("strategies.executions", { strategyId: "s1" });
    });

    it("silent on failure", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("fail"));
      await useStrategyStore.getState().fetchExecutions();
      expect(useStrategyStore.getState().error).toBeNull();
    });
  });

  // --- saveStrategy ---
  describe("saveStrategy", () => {
    it("calls RPC then re-fetches strategies", async () => {
      mockGatewayRpc
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, payload: { strategies: [{ id: "s1" }] } });
      await useStrategyStore.getState().saveStrategy({ id: "s1", name: "New" });
      expect(mockGatewayRpc).toHaveBeenCalledWith("strategies.save", { id: "s1", name: "New" });
      expect(mockGatewayRpc).toHaveBeenCalledWith("strategies.list", {});
    });

    it("sets error on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("save fail"));
      await useStrategyStore.getState().saveStrategy({ id: "s1" });
      expect(useStrategyStore.getState().error).toBe("Error: save fail");
    });
  });

  // --- deleteStrategy ---
  describe("deleteStrategy", () => {
    it("calls RPC and re-fetches", async () => {
      mockGatewayRpc
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, payload: { strategies: [] } });
      await useStrategyStore.getState().deleteStrategy("s1");
      expect(mockGatewayRpc).toHaveBeenCalledWith("strategies.delete", { id: "s1" });
    });

    it("clears selectedStrategyId if it matches deleted id", async () => {
      useStrategyStore.setState({ selectedStrategyId: "s1" });
      mockGatewayRpc
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, payload: { strategies: [] } });
      await useStrategyStore.getState().deleteStrategy("s1");
      expect(useStrategyStore.getState().selectedStrategyId).toBeNull();
    });
  });

  // --- toggleStrategy ---
  describe("toggleStrategy", () => {
    it("calls RPC with correct params", async () => {
      mockGatewayRpc
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, payload: { strategies: [] } });
      await useStrategyStore.getState().toggleStrategy("s1", true);
      expect(mockGatewayRpc).toHaveBeenCalledWith("strategies.toggle", { id: "s1", enabled: true });
    });

    it("sets error on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("toggle fail"));
      await useStrategyStore.getState().toggleStrategy("s1", false);
      expect(useStrategyStore.getState().error).toBe("Error: toggle fail");
    });
  });

  // --- runBacktest ---
  describe("runBacktest", () => {
    it("sets backtestRunning true during request", async () => {
      mockGatewayRpc.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, payload: { id: "bt-1" } }), 10),
          ),
      );
      const p = useStrategyStore.getState().runBacktest("s1");
      expect(useStrategyStore.getState().backtestRunning).toBe(true);
      await p;
      expect(useStrategyStore.getState().backtestRunning).toBe(false);
    });

    it("applies default config values for days and initialCapitalUsd", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { id: "bt-1" } });
      await useStrategyStore.getState().runBacktest("s1");
      expect(mockGatewayRpc).toHaveBeenCalledWith("backtest.run", {
        strategyId: "s1",
        symbol: undefined,
        days: 365,
        initialCapitalUsd: 10000,
        dataSource: undefined,
      });
    });

    it("stores result on success", async () => {
      const fakeResult = { id: "bt-1", strategyId: "s1" };
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: fakeResult });
      await useStrategyStore.getState().runBacktest("s1");
      expect(useStrategyStore.getState().backtestResult).toEqual(fakeResult);
    });

    it("sets error on non-ok response", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: false, error: "Bad request" });
      await useStrategyStore.getState().runBacktest("s1");
      expect(useStrategyStore.getState().error).toBe("Backtest failed");
    });

    it("sets error on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("timeout"));
      await useStrategyStore.getState().runBacktest("s1");
      expect(useStrategyStore.getState().error).toBe("Error: timeout");
    });

    it("always resets backtestRunning after completion", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("crash"));
      await useStrategyStore.getState().runBacktest("s1");
      expect(useStrategyStore.getState().backtestRunning).toBe(false);
    });
  });
});
