/**
 * Tigerpaw Trading Commands Extension
 *
 * Provides 8 unified cross-platform trading tools accessible from any
 * messaging channel (Telegram, Discord, Slack, etc.). These tools read
 * aggregated state from policy-state.json — no per-platform API calls.
 *
 * Tools:
 *   trading_portfolio_summary   — Cross-platform portfolio overview
 *   trading_daily_metrics       — Today's P&L, spend, trade count
 *   trading_positions           — All open positions across platforms
 *   trading_killswitch_status   — Current kill switch state
 *   trading_killswitch_activate — Activate the kill switch
 *   trading_killswitch_deactivate — Deactivate the kill switch
 *   trading_risk_status         — Risk limit utilization gauges
 *   trading_recent_trades       — Recent trade history from audit log
 */
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  loadPolicyState,
  checkKillSwitch,
  activateKillSwitch,
  deactivateKillSwitch,
  readAuditEntries,
  createLocalizedHelpers,
  type TradingPolicyConfig,
} from "tigerpaw/trading";
import { tradingCommandsConfigSchema } from "./config.js";

// -- i18n helpers ------------------------------------------------------------
const { t, rawTxt: txt, rawTxtD: txtD } = createLocalizedHelpers("extensions");

// -- Helpers -----------------------------------------------------------------

function $(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function progressBar(ratio: number, width = 10): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return `[${"#".repeat(filled)}${".".repeat(width - filled)}]`;
}

function hasData(state: {
  currentPortfolioValueUsd: number;
  openPositionCount: number;
  dailyTradeCount: number;
}): boolean {
  return (
    state.currentPortfolioValueUsd > 0 || state.openPositionCount > 0 || state.dailyTradeCount > 0
  );
}

const NO_DATA_MSG = () => t("noTradingData");

// -- Plugin ------------------------------------------------------------------

const tradingCommandsPlugin = {
  id: "trading-commands",
  name: "Trading Commands",
  description: "Unified cross-platform trading tools for messaging channels",
  kind: "trading" as const,
  configSchema: tradingCommandsConfigSchema,

  register(api: OpenClawPluginApi) {
    const policyConfig = api.tradingPolicyConfig;

    // -- Tool 1: trading_portfolio_summary ----------------------------------
    api.registerTool(
      {
        name: "trading_portfolio_summary",
        label: "Portfolio Summary",
        description:
          "Get an aggregated portfolio summary across all connected trading platforms, " +
          "including per-platform values, total portfolio value, high-water mark, and drawdown percentage.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const state = await loadPolicyState();
            if (!hasData(state)) return txt(NO_DATA_MSG());

            const platforms = Object.entries(state.portfolioByPlatform);
            const lines: string[] = [t("tc.portfolioSummary"), "─".repeat(40)];

            if (platforms.length > 0) {
              const maxLen = Math.max(...platforms.map(([k]) => k.length));
              for (const [platform, value] of platforms) {
                lines.push(`  ${platform.padEnd(maxLen)}  ${$(value)}`);
              }
              lines.push("─".repeat(40));
            }

            lines.push(`  ${t("tc.total").padEnd(16)}${$(state.currentPortfolioValueUsd)}`);
            lines.push(`  ${t("tc.highWater").padEnd(16)}${$(state.highWaterMarkUsd)}`);

            const drawdown =
              state.highWaterMarkUsd > 0
                ? ((state.highWaterMarkUsd - state.currentPortfolioValueUsd) /
                    state.highWaterMarkUsd) *
                  100
                : 0;
            lines.push(`  ${t("tc.drawdown").padEnd(16)}${pct(drawdown)}`);

            return txtD(lines.join("\n"), {
              portfolioByPlatform: state.portfolioByPlatform,
              totalUsd: state.currentPortfolioValueUsd,
              highWaterMarkUsd: state.highWaterMarkUsd,
              drawdownPercent: Math.round(drawdown * 100) / 100,
            });
          } catch (err) {
            return txt(
              t("tc.failedLoadPortfolio", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        },
      },
      { name: "trading_portfolio_summary" },
    );

    // -- Tool 2: trading_daily_metrics --------------------------------------
    api.registerTool(
      {
        name: "trading_daily_metrics",
        label: "Daily Metrics",
        description:
          "Get today's trading activity: daily P&L, cumulative spend, trade count, " +
          "and consecutive losses — alongside configured limits for context.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const state = await loadPolicyState();
            if (!hasData(state)) return txt(NO_DATA_MSG());

            const limits = policyConfig?.limits;
            const pnlSign = state.dailyPnlUsd >= 0 ? "+" : "-";

            const lines = [
              t("tc.dailyMetrics", { date: state.date }),
              "─".repeat(40),
              `  ${t("tc.dailyPnl")}:       ${pnlSign}${$(state.dailyPnlUsd)}`,
            ];

            if (limits?.maxDailySpendUsd) {
              const spendPct = (state.dailySpendUsd / limits.maxDailySpendUsd) * 100;
              lines.push(
                `  ${t("tc.dailySpend")}:     ${$(state.dailySpendUsd)} / ${$(limits.maxDailySpendUsd)} (${pct(spendPct)})`,
              );
            } else {
              lines.push(`  ${t("tc.dailySpend")}:     ${$(state.dailySpendUsd)}`);
            }

            if (limits?.maxTradesPerDay) {
              const tradePct = (state.dailyTradeCount / limits.maxTradesPerDay) * 100;
              lines.push(
                `  ${t("tc.trades")}:          ${state.dailyTradeCount} / ${limits.maxTradesPerDay} (${pct(tradePct)})`,
              );
            } else {
              lines.push(`  ${t("tc.trades")}:          ${state.dailyTradeCount}`);
            }

            if (limits?.consecutiveLossPause) {
              lines.push(
                `  ${t("tc.consecLosses")}:  ${state.consecutiveLosses} / ${limits.consecutiveLossPause}`,
              );
            } else {
              lines.push(`  ${t("tc.consecLosses")}:  ${state.consecutiveLosses}`);
            }

            lines.push(`  ${t("tc.portfolioValue")}:  ${$(state.currentPortfolioValueUsd)}`);

            return txtD(lines.join("\n"), {
              date: state.date,
              dailyPnlUsd: state.dailyPnlUsd,
              dailySpendUsd: state.dailySpendUsd,
              dailyTradeCount: state.dailyTradeCount,
              consecutiveLosses: state.consecutiveLosses,
              currentPortfolioValueUsd: state.currentPortfolioValueUsd,
            });
          } catch (err) {
            return txt(
              t("tc.failedLoadMetrics", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        },
      },
      { name: "trading_daily_metrics" },
    );

    // -- Tool 3: trading_positions ------------------------------------------
    api.registerTool(
      {
        name: "trading_positions",
        label: "Positions",
        description:
          "List all open positions across all connected trading platforms, " +
          "showing asset, platform, value, and percentage of portfolio.",
        parameters: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              description: "Filter by platform (e.g. 'alpaca', 'coinbase'). Omit for all.",
            },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          try {
            const state = await loadPolicyState();
            const filter = (params as { platform?: string })?.platform?.toLowerCase();

            let entries = Object.entries(state.positionsByAsset);
            if (filter) {
              entries = entries.filter(([, v]) => v.extensionId === filter);
            }

            if (entries.length === 0) {
              return txt(
                filter
                  ? t("common.noOpenPositionsOn", { platform: filter })
                  : t("common.noOpenPositions"),
              );
            }

            const lines = [t("tc.openPositions", { count: entries.length }), "─".repeat(50)];

            for (const [asset, pos] of entries) {
              lines.push(`  ${asset}  (${pos.extensionId})`);
              lines.push(
                `    Value: ${$(pos.valueUsd)}  |  ${pct(pos.percentOfPortfolio)} of portfolio`,
              );
            }

            lines.push("─".repeat(50));
            lines.push(`  ${t("tc.totalOpen")}: ${state.openPositionCount}`);

            return txtD(lines.join("\n"), {
              positions: state.positionsByAsset,
              openPositionCount: state.openPositionCount,
              filter: filter ?? null,
            });
          } catch (err) {
            return txt(
              t("tc.failedLoadPositions", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        },
      },
      { name: "trading_positions" },
    );

    // -- Tool 4: trading_killswitch_status ----------------------------------
    api.registerTool(
      {
        name: "trading_killswitch_status",
        label: "Kill Switch Status",
        description:
          "Check the current kill switch state: whether trading is halted globally " +
          "or on specific platforms, the mode (hard/soft), and the reason for activation.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const ks = await checkKillSwitch();
            const state = await loadPolicyState();

            const lines = [t("tc.killSwitchStatus"), "─".repeat(40)];

            if (ks.active) {
              lines.push(`  ${t("tc.globalActive", { mode: ks.mode ?? "hard" })}`);
              lines.push(`  ${t("tc.reason")}:  ${ks.reason ?? "unknown"}`);
              lines.push(`  ${t("tc.activatedBy")}:      ${ks.activatedBy ?? "unknown"}`);
              if (ks.activatedAt) {
                lines.push(`  ${t("tc.since")}:   ${new Date(ks.activatedAt).toISOString()}`);
              }
            } else {
              lines.push(`  ${t("tc.globalOff")}`);
            }

            const platformSwitches = Object.entries(state.platformKillSwitches);
            const activePlatforms = platformSwitches.filter(([, v]) => v.active);
            if (activePlatforms.length > 0) {
              lines.push("", `  ${t("tc.platformKillSwitches")}`);
              for (const [platform, ps] of activePlatforms) {
                lines.push(
                  `    ${t("tc.platformActive", { platform, reason: ps.reason ?? "no reason" })}`,
                );
              }
            }

            return txtD(lines.join("\n"), {
              globalActive: ks.active,
              globalMode: ks.mode,
              globalReason: ks.reason,
              activePlatforms: Object.fromEntries(activePlatforms),
            });
          } catch (err) {
            return txt(
              t("tc.failedKillSwitchCheck", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        },
      },
      { name: "trading_killswitch_status" },
    );

    // -- Tool 5: trading_killswitch_activate --------------------------------
    api.registerTool(
      {
        name: "trading_killswitch_activate",
        label: "Activate Kill Switch",
        description:
          "Activate the kill switch to halt ALL trading across all platforms. " +
          "Use mode 'hard' (default) to block everything, or 'soft' to allow sells and cancellations only.",
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description:
                "Why trading should be halted (e.g. 'suspicious activity', 'market volatility')",
            },
            mode: {
              type: "string",
              enum: ["hard", "soft"],
              description: "'hard' blocks all trades (default). 'soft' allows sells/cancels only.",
            },
          },
          required: ["reason"],
        },
        async execute(_id: string, params: unknown) {
          try {
            const { reason, mode } = params as { reason: string; mode?: "hard" | "soft" };
            const ksMode = mode === "soft" ? "soft" : "hard";
            await activateKillSwitch(reason, "operator", ksMode);
            return txtD(t("tc.killSwitchActivated", { mode: ksMode, reason }), {
              active: true,
              mode: ksMode,
              reason,
            });
          } catch (err) {
            return txt(
              t("tc.failedActivate", { error: err instanceof Error ? err.message : String(err) }),
            );
          }
        },
      },
      { name: "trading_killswitch_activate" },
    );

    // -- Tool 6: trading_killswitch_deactivate ------------------------------
    api.registerTool(
      {
        name: "trading_killswitch_deactivate",
        label: "Deactivate Kill Switch",
        description:
          "Deactivate the kill switch to resume trading. " +
          "WARNING: This allows all trading to resume immediately. " +
          "Only deactivate when you are sure it is safe to trade again.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const before = await checkKillSwitch();
            if (!before.active) {
              return txt(t("tc.killSwitchAlreadyOff"));
            }
            await deactivateKillSwitch("operator");
            return txtD(t("tc.killSwitchDeactivated"), { active: false });
          } catch (err) {
            return txt(
              t("tc.failedDeactivate", { error: err instanceof Error ? err.message : String(err) }),
            );
          }
        },
      },
      { name: "trading_killswitch_deactivate" },
    );

    // -- Tool 7: trading_risk_status ----------------------------------------
    api.registerTool(
      {
        name: "trading_risk_status",
        label: "Risk Status",
        description:
          "Show current utilization of all risk limits — daily spend, trade count, " +
          "positions, daily loss, drawdown, and consecutive losses — as percentage gauges.",
        parameters: { type: "object", properties: {}, required: [] },
        async execute(_id: string, _params: unknown) {
          try {
            const state = await loadPolicyState();
            if (!hasData(state)) return txt(NO_DATA_MSG());

            const limits = policyConfig?.limits;
            if (!limits) return txt(t("tc.noRiskLimits"));

            const lines = [t("tc.riskLimitUtilization"), "─".repeat(50)];
            const gauges: Record<string, number> = {};

            // Daily spend
            if (limits.maxDailySpendUsd && limits.maxDailySpendUsd !== Infinity) {
              const ratio = state.dailySpendUsd / limits.maxDailySpendUsd;
              gauges.dailySpend = ratio;
              lines.push(
                `  Daily Spend     ${progressBar(ratio)} ${pct(ratio * 100)}  (${$(state.dailySpendUsd)} / ${$(limits.maxDailySpendUsd)})`,
              );
            }

            // Trades per day
            if (limits.maxTradesPerDay && limits.maxTradesPerDay !== Infinity) {
              const ratio = state.dailyTradeCount / limits.maxTradesPerDay;
              gauges.tradesPerDay = ratio;
              lines.push(
                `  Trades/Day      ${progressBar(ratio)} ${pct(ratio * 100)}  (${state.dailyTradeCount} / ${limits.maxTradesPerDay})`,
              );
            }

            // Open positions
            if (limits.maxOpenPositions && limits.maxOpenPositions !== Infinity) {
              const ratio = state.openPositionCount / limits.maxOpenPositions;
              gauges.openPositions = ratio;
              lines.push(
                `  Positions       ${progressBar(ratio)} ${pct(ratio * 100)}  (${state.openPositionCount} / ${limits.maxOpenPositions})`,
              );
            }

            // Daily loss
            if (limits.dailyLossLimitPercent && state.currentPortfolioValueUsd > 0) {
              const dailyLossPct =
                (Math.abs(Math.min(0, state.dailyPnlUsd)) / state.currentPortfolioValueUsd) * 100;
              const ratio = dailyLossPct / limits.dailyLossLimitPercent;
              gauges.dailyLoss = ratio;
              lines.push(
                `  Daily Loss      ${progressBar(ratio)} ${pct(ratio * 100)}  (${pct(dailyLossPct)} / ${pct(limits.dailyLossLimitPercent)})`,
              );
            }

            // Drawdown
            if (limits.maxPortfolioDrawdownPercent && state.highWaterMarkUsd > 0) {
              const drawdownPct =
                ((state.highWaterMarkUsd - state.currentPortfolioValueUsd) /
                  state.highWaterMarkUsd) *
                100;
              const ratio = drawdownPct / limits.maxPortfolioDrawdownPercent;
              gauges.drawdown = ratio;
              lines.push(
                `  Drawdown        ${progressBar(ratio)} ${pct(ratio * 100)}  (${pct(drawdownPct)} / ${pct(limits.maxPortfolioDrawdownPercent)})`,
              );
            }

            // Consecutive losses
            if (limits.consecutiveLossPause && limits.consecutiveLossPause !== Infinity) {
              const ratio = state.consecutiveLosses / limits.consecutiveLossPause;
              gauges.consecLosses = ratio;
              lines.push(
                `  Consec. Losses  ${progressBar(ratio)} ${pct(ratio * 100)}  (${state.consecutiveLosses} / ${limits.consecutiveLossPause})`,
              );
            }

            // Warnings
            const atRisk = Object.entries(gauges).filter(([, r]) => r >= 0.8);
            if (atRisk.length > 0) {
              lines.push(
                "",
                `  ⚠ ${t("tc.approachingLimits", { limits: atRisk.map(([k]) => k).join(", ") })}`,
              );
            }

            return txtD(lines.join("\n"), { gauges });
          } catch (err) {
            return txt(
              t("tc.failedLoadRisk", { error: err instanceof Error ? err.message : String(err) }),
            );
          }
        },
      },
      { name: "trading_risk_status" },
    );

    // -- Tool 8: trading_recent_trades --------------------------------------
    api.registerTool(
      {
        name: "trading_recent_trades",
        label: "Recent Trades",
        description:
          "Show recent trade history from the audit log: orders submitted, filled, denied, or cancelled. " +
          "Defaults to the last 10 entries.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of recent entries to return (default 10, max 50).",
            },
            platform: {
              type: "string",
              description: "Filter by platform (e.g. 'alpaca'). Omit for all.",
            },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          try {
            const { limit: rawLimit, platform } =
              (params as { limit?: number; platform?: string }) ?? {};
            const cap = Math.min(Math.max(rawLimit ?? 10, 1), 50);

            const allEntries = await readAuditEntries();

            const tradeActions = new Set([
              "order_requested",
              "auto_approved",
              "manually_approved",
              "denied",
              "submitted",
              "filled",
              "rejected",
              "cancelled",
            ]);

            let filtered = allEntries.filter((e) => tradeActions.has(e.action));
            if (platform) {
              filtered = filtered.filter((e) => e.extensionId === platform.toLowerCase());
            }

            const recent = filtered.slice(-cap).reverse();

            if (recent.length === 0) {
              return txt(
                platform ? t("common.noRecentTradesOn", { platform }) : t("common.noRecentTrades"),
              );
            }

            const lines = [t("tc.recentTrades", { count: recent.length }), "─".repeat(55)];

            for (const entry of recent) {
              const time = entry.timestamp.slice(0, 19).replace("T", " ");
              const sym = entry.orderSnapshot?.symbol ?? "—";
              const side = entry.orderSnapshot?.side?.toUpperCase() ?? "";
              const notional = entry.orderSnapshot?.notionalUsd;
              const amt = notional ? $(notional) : "";

              lines.push(`  ${time}  ${entry.action.padEnd(18)} ${entry.extensionId}`);
              if (sym !== "—") {
                lines.push(`    ${side} ${sym} ${amt}`.trimEnd());
              }
              if (entry.action === "denied" && entry.error) {
                lines.push(`    Reason: ${entry.error}`);
              }
            }

            return txtD(lines.join("\n"), {
              count: recent.length,
              entries: recent.map((e) => ({
                timestamp: e.timestamp,
                action: e.action,
                extensionId: e.extensionId,
                symbol: e.orderSnapshot?.symbol,
                side: e.orderSnapshot?.side,
                notionalUsd: e.orderSnapshot?.notionalUsd,
              })),
            });
          } catch (err) {
            return txt(
              t("tc.failedReadHistory", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        },
      },
      { name: "trading_recent_trades" },
    );
  },
};

export default tradingCommandsPlugin;
