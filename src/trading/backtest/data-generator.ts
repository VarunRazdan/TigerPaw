import type { OHLCV } from "./types.js";

/**
 * Seeded PRNG for deterministic results.
 * Same seed → same sequence of random numbers.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export type GeneratorPattern = "trending_up" | "trending_down" | "mean_reverting" | "volatile" | "random";

export type GeneratorConfig = {
  symbol: string;
  startDate: string;  // ISO 8601
  endDate: string;    // ISO 8601
  startPrice: number;
  pattern: GeneratorPattern;
  /** Annualized volatility (e.g., 0.3 for 30%). */
  volatility?: number;
  /** Annualized drift for trending patterns (e.g., 0.1 for 10%). */
  drift?: number;
  /** Seed for deterministic output. */
  seed?: number;
};

const MS_PER_DAY = 86_400_000;

/**
 * Generate synthetic daily OHLCV bars.
 * Uses geometric Brownian motion with configurable drift and volatility.
 */
export function generateOHLCV(config: GeneratorConfig): OHLCV[] {
  const {
    startDate,
    endDate,
    startPrice,
    pattern,
    volatility = 0.3,
    drift: rawDrift,
    seed = 42,
  } = config;

  const rand = seededRandom(seed);
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const days = Math.floor((end - start) / MS_PER_DAY);

  if (days <= 0) return [];

  // Resolve drift based on pattern
  let dailyDrift: number;
  const dailyVol = volatility / Math.sqrt(252);
  switch (pattern) {
    case "trending_up":
      dailyDrift = (rawDrift ?? 0.15) / 252;
      break;
    case "trending_down":
      dailyDrift = -(rawDrift ?? 0.15) / 252;
      break;
    case "mean_reverting":
      dailyDrift = 0;
      break;
    case "volatile":
      dailyDrift = (rawDrift ?? 0.05) / 252;
      break;
    case "random":
    default:
      dailyDrift = (rawDrift ?? 0) / 252;
      break;
  }

  // Box-Muller transform for normal distribution
  function normalRandom(): number {
    const u1 = rand();
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  }

  const bars: OHLCV[] = [];
  let price = startPrice;
  const meanPrice = startPrice; // For mean-reverting pattern

  for (let i = 0; i < days; i++) {
    const timestamp = start + i * MS_PER_DAY;

    // Mean-reverting adjustment
    let effectiveDrift = dailyDrift;
    if (pattern === "mean_reverting") {
      const reversion = 0.05; // Strength of mean reversion
      effectiveDrift = reversion * (meanPrice - price) / price;
    }

    // GBM step
    const shock = normalRandom();
    const returns = effectiveDrift + dailyVol * shock;
    const close = price * (1 + returns);

    // Simulate intraday range
    const volFactor = pattern === "volatile" ? 2.0 : 1.0;
    const intraVol = dailyVol * volFactor;
    const high = Math.max(price, close) * (1 + Math.abs(normalRandom()) * intraVol * 0.5);
    const low = Math.min(price, close) * (1 - Math.abs(normalRandom()) * intraVol * 0.5);
    const open = price;

    // Volume: base + random variation, correlated with volatility
    const baseVolume = 1_000_000;
    const volMultiplier = 1 + Math.abs(returns) * 20;
    const volume = Math.round(baseVolume * volMultiplier * (0.5 + rand()));

    bars.push({
      timestamp,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume,
    });

    price = close;
  }

  return bars;
}

/** Quick helper: generate 1 year of trending-up data. */
export function generateDemoBars(symbol: string, seed = 42): OHLCV[] {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * MS_PER_DAY);
  return generateOHLCV({
    symbol,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    startPrice: 150,
    pattern: "trending_up",
    volatility: 0.25,
    drift: 0.12,
    seed,
  });
}
