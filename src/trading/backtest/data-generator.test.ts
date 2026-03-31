import { describe, expect, it } from "vitest";
import { generateOHLCV, generateDemoBars, type GeneratorConfig } from "./data-generator.js";

// Pure functions -- no mocks needed.

function makeConfig(overrides: Partial<GeneratorConfig> = {}): GeneratorConfig {
  return {
    symbol: "TEST",
    startDate: "2024-01-01",
    endDate: "2024-04-01",
    startPrice: 100,
    pattern: "random",
    seed: 42,
    ...overrides,
  };
}

// ---------- determinism -----------------------------------------------------

describe("determinism", () => {
  it("produces identical output for the same seed", () => {
    const a = generateOHLCV(makeConfig({ seed: 123 }));
    const b = generateOHLCV(makeConfig({ seed: 123 }));
    expect(a).toEqual(b);
  });

  it("produces different output for different seeds", () => {
    const a = generateOHLCV(makeConfig({ seed: 1 }));
    const b = generateOHLCV(makeConfig({ seed: 2 }));
    expect(a).not.toEqual(b);
  });
});

// ---------- bar count -------------------------------------------------------

describe("bar count", () => {
  it("generates correct number of bars for date range", () => {
    const bars = generateOHLCV(
      makeConfig({
        startDate: "2024-01-01",
        endDate: "2024-01-11", // 10 days
      }),
    );
    expect(bars).toHaveLength(10);
  });

  it("returns empty array when endDate equals startDate", () => {
    const bars = generateOHLCV(
      makeConfig({
        startDate: "2024-01-01",
        endDate: "2024-01-01",
      }),
    );
    expect(bars).toEqual([]);
  });

  it("returns empty array when endDate is before startDate", () => {
    const bars = generateOHLCV(
      makeConfig({
        startDate: "2024-06-01",
        endDate: "2024-01-01",
      }),
    );
    expect(bars).toEqual([]);
  });
});

// ---------- OHLCV validity --------------------------------------------------

describe("OHLCV validity", () => {
  it("high >= max(open, close) for every bar", () => {
    const bars = generateOHLCV(makeConfig());
    for (const bar of bars) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
    }
  });

  it("low <= min(open, close) for every bar", () => {
    const bars = generateOHLCV(makeConfig());
    for (const bar of bars) {
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
    }
  });

  it("all prices are positive", () => {
    const bars = generateOHLCV(makeConfig({ startPrice: 100 }));
    for (const bar of bars) {
      expect(bar.open).toBeGreaterThan(0);
      expect(bar.high).toBeGreaterThan(0);
      expect(bar.low).toBeGreaterThan(0);
      expect(bar.close).toBeGreaterThan(0);
    }
  });

  it("volume is a positive integer for every bar", () => {
    const bars = generateOHLCV(makeConfig());
    for (const bar of bars) {
      expect(bar.volume).toBeGreaterThan(0);
      expect(Number.isInteger(bar.volume)).toBe(true);
    }
  });
});

// ---------- patterns --------------------------------------------------------

describe("patterns", () => {
  it("trending_up pattern has upward drift over time", () => {
    const bars = generateOHLCV(
      makeConfig({
        pattern: "trending_up",
        startPrice: 100,
        drift: 0.5,
        volatility: 0.1,
        startDate: "2024-01-01",
        endDate: "2025-01-01",
      }),
    );
    expect(bars.length).toBeGreaterThan(0);
    const firstClose = bars[0].close;
    const lastClose = bars[bars.length - 1].close;
    expect(lastClose).toBeGreaterThan(firstClose);
  });

  it("trending_down pattern has downward drift over time", () => {
    const bars = generateOHLCV(
      makeConfig({
        pattern: "trending_down",
        startPrice: 100,
        drift: 0.5,
        volatility: 0.1,
        startDate: "2024-01-01",
        endDate: "2025-01-01",
      }),
    );
    expect(bars.length).toBeGreaterThan(0);
    const firstClose = bars[0].close;
    const lastClose = bars[bars.length - 1].close;
    expect(lastClose).toBeLessThan(firstClose);
  });

  it("volatile pattern has higher intraday range than random", () => {
    const volatileBars = generateOHLCV(
      makeConfig({ pattern: "volatile", seed: 42, volatility: 0.3 }),
    );
    const randomBars = generateOHLCV(makeConfig({ pattern: "random", seed: 42, volatility: 0.3 }));

    const avgRangeVolatile =
      volatileBars.reduce((s, b) => s + (b.high - b.low) / b.open, 0) / volatileBars.length;
    const avgRangeRandom =
      randomBars.reduce((s, b) => s + (b.high - b.low) / b.open, 0) / randomBars.length;

    expect(avgRangeVolatile).toBeGreaterThan(avgRangeRandom);
  });
});

// ---------- timestamps ------------------------------------------------------

describe("timestamps", () => {
  it("timestamps are in ascending order", () => {
    const bars = generateOHLCV(makeConfig());
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].timestamp).toBeGreaterThan(bars[i - 1].timestamp);
    }
  });

  it("timestamps are spaced one day apart", () => {
    const bars = generateOHLCV(
      makeConfig({
        startDate: "2024-01-01",
        endDate: "2024-01-05",
      }),
    );
    for (let i = 1; i < bars.length; i++) {
      const diff = bars[i].timestamp - bars[i - 1].timestamp;
      expect(diff).toBe(86_400_000);
    }
  });
});

// ---------- generateDemoBars ------------------------------------------------

describe("generateDemoBars", () => {
  it("produces ~365 bars", () => {
    const bars = generateDemoBars("DEMO");
    expect(bars.length).toBeGreaterThanOrEqual(364);
    expect(bars.length).toBeLessThanOrEqual(366);
  });

  it("is deterministic with same seed (prices match)", () => {
    const a = generateDemoBars("X", 99);
    const b = generateDemoBars("X", 99);
    // Timestamps may differ because generateDemoBars uses Date.now(),
    // but prices are deterministic from the seed.
    expect(a.map((b) => b.close)).toEqual(b.map((b) => b.close));
    expect(a.map((b) => b.open)).toEqual(b.map((b) => b.open));
    expect(a.map((b) => b.volume)).toEqual(b.map((b) => b.volume));
  });
});
