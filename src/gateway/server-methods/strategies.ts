/**
 * RPC methods: strategies.list, strategies.get, strategies.save,
 * strategies.delete, strategies.toggle, strategies.execute,
 * strategies.executions, strategies.clearHistory
 *
 * Provides CRUD and execution control for trading strategies (F6).
 */
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const strategiesHandlers: GatewayRequestHandlers = {
  "strategies.list": async ({ respond }) => {
    try {
      const { listStrategies } = await import("../../trading/strategies/registry.js");
      const strategies = await listStrategies();
      respond(true, { strategies }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.get": async ({ params, respond }) => {
    try {
      const id = params.id as string;
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const { getStrategy } = await import("../../trading/strategies/registry.js");
      const strategy = await getStrategy(id);
      if (!strategy) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategy not found"));
        return;
      }
      respond(true, { strategy }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.save": async ({ params, respond }) => {
    try {
      const { saveStrategy } = await import("../../trading/strategies/registry.js");
      const strategy = await saveStrategy(params as Parameters<typeof saveStrategy>[0]);
      respond(true, { strategy }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.delete": async ({ params, respond }) => {
    try {
      const id = params.id as string;
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const { deleteStrategy } = await import("../../trading/strategies/registry.js");
      const deleted = await deleteStrategy(id);
      respond(true, { deleted }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.toggle": async ({ params, respond }) => {
    try {
      const id = params.id as string;
      const enabled = params.enabled as boolean;
      if (!id || typeof enabled !== "boolean") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "id and enabled (boolean) are required"),
        );
        return;
      }
      const { toggleStrategy } = await import("../../trading/strategies/registry.js");
      const strategy = await toggleStrategy(id, enabled);
      if (!strategy) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategy not found"));
        return;
      }
      respond(true, { strategy }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.execute": async ({ params, respond }) => {
    try {
      const strategyId = params.strategyId as string;
      if (!strategyId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategyId is required"));
        return;
      }

      const { getStrategy } = await import("../../trading/strategies/registry.js");
      const strategy = await getStrategy(strategyId);
      if (!strategy) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategy not found"));
        return;
      }
      if (!strategy.enabled) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategy is disabled"));
        return;
      }

      const { buildRunnerDeps } = await import("../../trading/strategies/runner-deps.js");
      const { executeStrategy } = await import("../../trading/strategies/runner.js");

      // Build runner deps with a stub gateway RPC — the runner calls
      // trading.getState and trading.recordFill internally.
      const { loadPolicyState } = await import("../../trading/policy-state.js");

      const internalRpc = async (
        method: string,
        rpcParams: Record<string, unknown>,
      ): Promise<{ ok: boolean; payload?: Record<string, unknown>; error?: string }> => {
        if (method === "trading.getState") {
          const state = await loadPolicyState();
          return { ok: true, payload: state as unknown as Record<string, unknown> };
        }
        if (method === "trading.recordFill") {
          const { recordTradeFill } = await import("../../trading/realized-pnl.js");
          const result = await recordTradeFill(rpcParams as Parameters<typeof recordTradeFill>[0]);
          return { ok: true, payload: result as unknown as Record<string, unknown> };
        }
        return { ok: false, error: `Method not found: ${method}` };
      };

      const deps = buildRunnerDeps(internalRpc);
      const execution = await executeStrategy(strategyId, deps);
      respond(true, { execution }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.executions": async ({ params, respond }) => {
    try {
      const strategyId = params.strategyId as string | undefined;
      const { listExecutions } = await import("../../trading/strategies/registry.js");
      const executions = await listExecutions(strategyId);
      respond(true, { executions }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "strategies.clearHistory": async ({ params, respond }) => {
    try {
      const strategyId = params.strategyId as string;
      if (!strategyId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategyId is required"));
        return;
      }
      const { clearExecutions } = await import("../../trading/strategies/registry.js");
      const removed = await clearExecutions(strategyId);
      respond(true, { removed }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
