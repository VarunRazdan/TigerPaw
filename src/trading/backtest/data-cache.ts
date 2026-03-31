/**
 * File-based cache for backtest OHLCV data.
 *
 * Stores fetched bars as JSON files keyed by symbol, timeframe, and date range.
 * Files older than CACHE_TTL_MS are treated as stale and re-fetched.
 */
import { readFile, stat, unlink, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeJsonAtomic } from "../../infra/json-files.js";
import type { OHLCV } from "./types.js";

const CACHE_DIR = join(homedir(), ".tigerpaw", "trading", "backtest-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
): string {
  // Sanitize symbol for filesystem safety
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeStart = startDate.slice(0, 10);
  const safeEnd = endDate.slice(0, 10);
  return `${safeSymbol}_${timeframe}_${safeStart}_${safeEnd}.json`;
}

export async function getCachedBars(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
): Promise<OHLCV[] | null> {
  const key = cacheKey(symbol, timeframe, startDate, endDate);
  const filePath = join(CACHE_DIR, key);

  try {
    const fileStat = await stat(filePath);
    const ageMs = Date.now() - fileStat.mtimeMs;
    if (ageMs > CACHE_TTL_MS) return null; // Stale

    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as OHLCV[];
  } catch {
    return null;
  }
}

export async function setCachedBars(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
  bars: OHLCV[],
): Promise<void> {
  const key = cacheKey(symbol, timeframe, startDate, endDate);
  const filePath = join(CACHE_DIR, key);
  await writeJsonAtomic(filePath, bars, { mode: 0o600, ensureDirMode: 0o700 });
}

export async function clearCache(symbol?: string): Promise<void> {
  try {
    const files = await readdir(CACHE_DIR);
    for (const file of files) {
      if (!symbol || file.startsWith(symbol.replace(/[^a-zA-Z0-9._-]/g, "_"))) {
        await unlink(join(CACHE_DIR, file)).catch(() => {});
      }
    }
  } catch {
    // Cache dir doesn't exist yet — nothing to clear
  }
}
