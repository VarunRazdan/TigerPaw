import { describe, expect, it } from "vitest";
import { computeRiskMetrics, formatRatio, ratioSeverity } from "../risk-metrics";

describe("computeRiskMetrics", () => {
  it("returns null-safe defaults for empty array", () => {
    const m = computeRiskMetrics([]);
    expect(m.sharpe).toBeNull();
    expect(m.sortino).toBeNull();
    expect(m.profitFactor).toBeNull();
    expect(m.totalPnl).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.avgWin).toBe(0);
    expect(m.avgLoss).toBe(0);
    expect(m.maxDrawdownPercent).toBe(0);
    expect(m.tradingDays).toBe(0);
  });

  it("totalPnl sums all values", () => {
    const m = computeRiskMetrics([100, -50, 30, -10]);
    expect(m.totalPnl).toBe(70);
  });

  it("winRate counts only positive days (0 is NOT a win)", () => {
    const m = computeRiskMetrics([10, 0, -5, 20]);
    // 2 wins out of 4
    expect(m.winRate).toBe(50);
  });

  it("avgWin averages only positive days", () => {
    const m = computeRiskMetrics([100, 200, -50]);
    expect(m.avgWin).toBe(150);
  });

  it("avgLoss averages absolute value of negative days", () => {
    const m = computeRiskMetrics([100, -40, -60]);
    expect(m.avgLoss).toBe(50);
  });

  it("profitFactor equals grossProfit / grossLoss", () => {
    const m = computeRiskMetrics([100, 50, -50]);
    // grossProfit = 150, grossLoss = 50
    expect(m.profitFactor).toBe(3);
  });

  it("profitFactor is null when no losses and no wins", () => {
    const m = computeRiskMetrics([0, 0, 0]);
    expect(m.profitFactor).toBeNull();
  });

  it("profitFactor is null when only wins (no losses)", () => {
    const m = computeRiskMetrics([10, 20, 30]);
    expect(m.profitFactor).toBeNull();
  });

  it("sharpe is null for single data point", () => {
    const m = computeRiskMetrics([100]);
    expect(m.sharpe).toBeNull();
  });

  it("sharpe is a finite number with sufficient variance", () => {
    const m = computeRiskMetrics([100, -50, 80, -30, 60]);
    expect(m.sharpe).not.toBeNull();
    expect(Number.isFinite(m.sharpe!)).toBe(true);
  });

  it("sharpe is null when stdDev is 0 (constant returns)", () => {
    const m = computeRiskMetrics([10, 10, 10, 10]);
    expect(m.sharpe).toBeNull();
  });

  it("sortino is null for single data point", () => {
    const m = computeRiskMetrics([50]);
    expect(m.sortino).toBeNull();
  });

  it("sortino uses only downside deviation", () => {
    // With negative returns, sortino should differ from sharpe
    const data = [100, -50, 80, -30, 60];
    const m = computeRiskMetrics(data);
    expect(m.sortino).not.toBeNull();
    expect(Number.isFinite(m.sortino!)).toBe(true);
    // Sortino should differ from Sharpe since downside deviation != stdDev
    expect(m.sortino).not.toBe(m.sharpe);
  });

  it("maxDrawdownPercent is 0 when only gains", () => {
    const m = computeRiskMetrics([10, 20, 30, 40]);
    expect(m.maxDrawdownPercent).toBe(0);
  });

  it("maxDrawdownPercent computes peak-to-trough correctly", () => {
    // Cumulative: 100, 200, 150, 120, 180
    // Peak at 200, trough at 120 => drawdown 80, pct = (80/200)*100 = 40
    const m = computeRiskMetrics([100, 100, -50, -30, 60]);
    expect(m.maxDrawdownPercent).toBe(40);
  });

  it("maxDrawdownPercent is 0 when peak is 0", () => {
    // All negative: cumulative never exceeds 0
    const m = computeRiskMetrics([-10, -20, -5]);
    expect(m.maxDrawdownPercent).toBe(0);
  });

  it("tradingDays equals input length", () => {
    const m = computeRiskMetrics([1, 2, 3, 4, 5, 6, 7]);
    expect(m.tradingDays).toBe(7);
  });
});

describe("formatRatio", () => {
  it("returns em dash for null", () => {
    expect(formatRatio(null)).toBe("\u2014");
  });

  it("formats positive number to 2 decimal places", () => {
    expect(formatRatio(1.5678)).toBe("1.57");
  });

  it("formats negative number to 2 decimal places", () => {
    expect(formatRatio(-1.239)).toBe("-1.24");
  });

  it("formats zero as '0.00'", () => {
    expect(formatRatio(0)).toBe("0.00");
  });
});

describe("ratioSeverity", () => {
  it("returns 'neutral' for null", () => {
    expect(ratioSeverity(null)).toBe("neutral");
  });

  it("returns 'good' for values >= 1.0", () => {
    expect(ratioSeverity(1.5)).toBe("good");
    expect(ratioSeverity(2.0)).toBe("good");
  });

  it("returns 'neutral' for values 0 to 0.99", () => {
    expect(ratioSeverity(0.5)).toBe("neutral");
    expect(ratioSeverity(0.99)).toBe("neutral");
  });

  it("returns 'bad' for negative values", () => {
    expect(ratioSeverity(-0.5)).toBe("bad");
    expect(ratioSeverity(-2.0)).toBe("bad");
  });

  it("returns 'good' for exactly 1.0 (boundary)", () => {
    expect(ratioSeverity(1.0)).toBe("good");
  });

  it("returns 'neutral' for exactly 0.0 (boundary)", () => {
    expect(ratioSeverity(0.0)).toBe("neutral");
  });
});
