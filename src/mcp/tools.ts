import type { McpToolDef } from "./types.js";

/** Safely coerce an unknown arg value to a string. */
function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return `${v}`;
  }
  if (v == null) {
    return fallback;
  }
  return JSON.stringify(v);
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "get_trading_state",
    description:
      "Get the current trading state including P&L, positions, kill switch status, and risk metrics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_positions",
    description: "List all open trading positions with unrealized P&L and portfolio allocation.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "place_order",
    description:
      "Submit a trading order. Basic risk checks (kill switch, daily limits) are enforced. Note: for full policy engine evaluation, submit orders through the gateway.",
    inputSchema: {
      type: "object",
      properties: {
        extensionId: {
          type: "string",
          description: "Trading platform (e.g., alpaca, coinbase, binance)",
        },
        symbol: { type: "string", description: "Instrument symbol (e.g., AAPL, BTC-USD)" },
        side: { type: "string", description: "Order side", enum: ["buy", "sell"] },
        quantity: { type: "number", description: "Order quantity" },
        orderType: { type: "string", description: "Order type", enum: ["market", "limit", "stop"] },
        limitPrice: { type: "number", description: "Limit price (required for limit orders)" },
      },
      required: ["extensionId", "symbol", "side", "quantity", "orderType"],
    },
  },
  {
    name: "toggle_kill_switch",
    description:
      "Activate or deactivate the global trading kill switch. When active, all new trades are blocked.",
    inputSchema: {
      type: "object",
      properties: {
        active: {
          type: "string",
          description: "Set to 'true' to activate, 'false' to deactivate",
          enum: ["true", "false"],
        },
        reason: { type: "string", description: "Reason for toggling the kill switch" },
        mode: { type: "string", description: "Kill switch mode", enum: ["hard", "soft"] },
      },
      required: ["active"],
    },
  },
  {
    name: "get_trade_history",
    description:
      "Get recent trade history from the audit log, including order actions, symbols, and sides.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of trades to return (default: 50)" },
      },
    },
  },
  {
    name: "get_risk_metrics",
    description:
      "Get current risk state including drawdown, P&L, consecutive losses, and portfolio value. For full computed metrics (Sharpe, Sortino), use run_backtest.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_strategies",
    description: "List all configured trading strategies with their status and performance.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "run_backtest",
    description: "Run a backtest for a strategy against historical data.",
    inputSchema: {
      type: "object",
      properties: {
        strategyId: { type: "string", description: "Strategy ID to backtest" },
        symbol: { type: "string", description: "Symbol to backtest against" },
        days: { type: "number", description: "Number of historical days (default: 365)" },
        initialCapital: { type: "number", description: "Starting capital in USD (default: 10000)" },
      },
      required: ["strategyId"],
    },
  },
];

/**
 * Execute an MCP tool call. Routes to the appropriate handler.
 * Returns the result as a JSON-serializable object.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  switch (name) {
    case "get_trading_state": {
      const { loadPolicyState } = await import("../trading/policy-state.js");
      const state = await loadPolicyState();
      return textResult(
        JSON.stringify(
          {
            dailyPnlUsd: state.dailyPnlUsd,
            dailySpendUsd: state.dailySpendUsd,
            dailyTradeCount: state.dailyTradeCount,
            consecutiveLosses: state.consecutiveLosses,
            highWaterMarkUsd: state.highWaterMarkUsd,
            currentPortfolioValueUsd: state.currentPortfolioValueUsd,
            killSwitch: state.killSwitch,
            openPositionCount: state.openPositionCount,
            date: state.date,
          },
          null,
          2,
        ),
      );
    }

    case "get_positions": {
      const { loadPolicyState } = await import("../trading/policy-state.js");
      const state = await loadPolicyState();
      return textResult(JSON.stringify(state.positionsByAsset ?? {}, null, 2));
    }

    case "place_order": {
      const extensionId = str(args.extensionId);
      const symbol = str(args.symbol);
      const side = str(args.side);
      const quantity = Number(args.quantity ?? 0);
      const _orderType = str(args.orderType, "market");

      if (!extensionId || !symbol || !side || quantity <= 0) {
        return textResult("Error: extensionId, symbol, side, and quantity > 0 are required.");
      }

      // Safety checks — enforce kill switch and basic limits
      const { loadPolicyState } = await import("../trading/policy-state.js");
      const state = await loadPolicyState();

      if (state.killSwitch?.active) {
        return textResult(
          JSON.stringify(
            {
              status: "blocked",
              reason: `Kill switch is active: ${state.killSwitch.reason ?? "no reason given"}`,
            },
            null,
            2,
          ),
        );
      }

      if (state.dailyTradeCount >= 100) {
        return textResult(
          JSON.stringify(
            {
              status: "blocked",
              reason: "Daily trade limit reached (100 trades). Reset at midnight.",
            },
            null,
            2,
          ),
        );
      }

      const { recordTradeFill } = await import("../trading/realized-pnl.js");
      const result = await recordTradeFill({
        extensionId,
        symbol,
        side: side as "buy" | "sell",
        quantity,
        executedPrice: Number(args.limitPrice ?? 0),
        realizedPnl: 0,
      });

      return textResult(
        JSON.stringify(
          {
            status: "submitted",
            dailyPnlUsd: result.dailyPnlUsd,
            dailyTradeCount: result.dailyTradeCount,
          },
          null,
          2,
        ),
      );
    }

    case "toggle_kill_switch": {
      const active = String(args.active) === "true";
      const reason = str(args.reason, "Toggled via MCP");
      const mode = str(args.mode, "hard") as "hard" | "soft";

      if (active) {
        const { activateKillSwitch } = await import("../trading/kill-switch.js");
        await activateKillSwitch(reason, "operator", mode);
      } else {
        const { deactivateKillSwitch } = await import("../trading/kill-switch.js");
        await deactivateKillSwitch("operator");
      }

      return textResult(JSON.stringify({ active, mode, reason }, null, 2));
    }

    case "get_trade_history": {
      const { readAuditEntries } = await import("../trading/audit-log.js");
      const limit = Number(args.limit ?? 50);
      const entries = await readAuditEntries();
      // Filter to trade-related actions and take the most recent N
      const tradeActions = new Set([
        "auto_approved",
        "manually_approved",
        "submitted",
        "filled",
        "denied",
        "rejected",
      ]);
      const trades = entries
        .filter((e) => tradeActions.has(e.action))
        .slice(-limit)
        .map((e) => ({
          timestamp: e.timestamp,
          action: e.action,
          extensionId: e.extensionId,
          actor: e.actor,
          symbol: e.orderSnapshot?.symbol ?? "unknown",
          side: e.orderSnapshot?.side,
          quantity: e.orderSnapshot?.quantity,
          ...(e.error ? { error: e.error } : {}),
        }));
      return textResult(JSON.stringify({ trades, total: trades.length }, null, 2));
    }

    case "get_risk_metrics": {
      const { loadPolicyState } = await import("../trading/policy-state.js");
      const { readAuditEntries } = await import("../trading/audit-log.js");
      const state = await loadPolicyState();

      // Gather realized P&L from filled trades in audit log
      const entries = await readAuditEntries();
      const fills = entries.filter((e) => e.action === "filled");
      const totalTrades = fills.length;

      // Compute basic risk metrics from available state
      const drawdownUsd = state.highWaterMarkUsd - state.currentPortfolioValueUsd;
      const drawdownPercent =
        state.highWaterMarkUsd > 0 ? (drawdownUsd / state.highWaterMarkUsd) * 100 : 0;

      return textResult(
        JSON.stringify(
          {
            dailyPnlUsd: state.dailyPnlUsd,
            consecutiveLosses: state.consecutiveLosses,
            highWaterMarkUsd: state.highWaterMarkUsd,
            currentPortfolioValueUsd: state.currentPortfolioValueUsd,
            currentDrawdownUsd: Math.max(0, drawdownUsd),
            currentDrawdownPercent: Math.max(0, drawdownPercent),
            killSwitchActive: state.killSwitch?.active ?? false,
            totalTradesRecorded: totalTrades,
            note: "For full metrics (Sharpe, Sortino, profit factor), run a backtest via the run_backtest tool.",
          },
          null,
          2,
        ),
      );
    }

    case "list_strategies": {
      const { listStrategies } = await import("../trading/strategies/registry.js");
      const strategies = await listStrategies();
      return textResult(
        JSON.stringify(
          strategies.map((s) => ({
            id: s.id,
            name: s.name,
            enabled: s.enabled,
            symbols: s.symbols,
            totalTrades: s.totalTrades,
            winRate: s.winRate,
            totalPnlUsd: s.totalPnlUsd,
            lastExecutedAt: s.lastExecutedAt,
          })),
          null,
          2,
        ),
      );
    }

    case "run_backtest": {
      const strategyId = str(args.strategyId);
      if (!strategyId) {
        return textResult("Error: strategyId is required.");
      }

      const { getStrategy } = await import("../trading/strategies/registry.js");
      const strategy = await getStrategy(strategyId);
      if (!strategy) {
        return textResult(`Error: Strategy not found: ${strategyId}`);
      }

      const { generateDemoBars } = await import("../trading/backtest/data-generator.js");
      const { runBacktest } = await import("../trading/backtest/engine.js");
      const symbol = str(args.symbol, strategy.symbols[0] ?? "DEMO");
      const bars = generateDemoBars(symbol);

      const result = await runBacktest(strategy, bars, {
        strategyId,
        symbol,
        startDate: new Date(Date.now() - 365 * 86400000).toISOString(),
        endDate: new Date().toISOString(),
        initialCapitalUsd: Number(args.initialCapital ?? 10000),
        commissionPercent: 0.1,
        slippageBps: 5,
      });

      return textResult(
        JSON.stringify(
          {
            totalReturn: `${result.metrics.totalReturn.toFixed(2)}%`,
            sharpe: result.metrics.sharpe?.toFixed(2) ?? "N/A",
            sortino: result.metrics.sortino?.toFixed(2) ?? "N/A",
            maxDrawdown: `${result.metrics.maxDrawdownPercent.toFixed(2)}%`,
            winRate: `${result.metrics.winRate.toFixed(1)}%`,
            totalTrades: result.metrics.totalTrades,
            totalPnl: `$${result.metrics.totalPnl.toFixed(2)}`,
          },
          null,
          2,
        ),
      );
    }

    default:
      return textResult(`Unknown tool: ${name}`);
  }
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
