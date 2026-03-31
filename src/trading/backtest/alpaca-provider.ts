/**
 * Alpaca historical data provider for backtests.
 *
 * Fetches daily OHLCV bars from the Alpaca Data API (v2).
 * Uses the same API key/secret as the Alpaca trading extension.
 * Caches results locally with a 24-hour TTL.
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getCachedBars, setCachedBars } from "./data-cache.js";
import type { DataProvider, DataProviderRequest, DataProviderResult } from "./data-provider.js";
import type { OHLCV } from "./types.js";

const log = createSubsystemLogger("trading/backtest/alpaca");

const DATA_BASE_URL = "https://data.alpaca.markets";

type AlpacaBar = {
  t: string; // ISO timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

type AlpacaBarsResponse = {
  bars: AlpacaBar[];
  next_page_token: string | null;
};

function mapBar(bar: AlpacaBar): OHLCV {
  return {
    timestamp: new Date(bar.t).getTime(),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  };
}

async function loadAlpacaConfig(): Promise<{
  apiKeyId: string;
  apiSecretKey: string;
} | null> {
  try {
    const { loadConfig } = await import("../../config/config.js");
    const config = loadConfig();
    const entry = (config as Record<string, unknown>).plugins as
      | Record<string, unknown>
      | undefined;
    const entries = entry?.entries as Record<string, unknown> | undefined;
    const alpaca = entries?.alpaca as Record<string, unknown> | undefined;
    const alpacaCfg = alpaca?.config as Record<string, unknown> | undefined;

    if (!alpacaCfg?.apiKeyId || !alpacaCfg?.apiSecretKey) {
      return null;
    }

    return {
      apiKeyId: alpacaCfg.apiKeyId as string,
      apiSecretKey: alpacaCfg.apiSecretKey as string,
    };
  } catch {
    return null;
  }
}

export class AlpacaDataProvider implements DataProvider {
  readonly source = "alpaca" as const;

  async isAvailable(): Promise<boolean> {
    const cfg = await loadAlpacaConfig();
    return cfg !== null;
  }

  async fetchBars(request: DataProviderRequest): Promise<DataProviderResult> {
    const timeframe = request.timeframe ?? "1Day";

    // Check cache first
    const cached = await getCachedBars(
      request.symbol,
      timeframe,
      request.startDate,
      request.endDate,
    );
    if (cached) {
      log.info(`cache hit for ${request.symbol} (${cached.length} bars)`);
      return {
        bars: cached,
        source: "alpaca",
        cached: true,
        metadata: {
          fetchedAt: new Date().toISOString(),
          barCount: cached.length,
          firstBar: cached[0] ? new Date(cached[0].timestamp).toISOString() : "",
          lastBar: cached.at(-1) ? new Date(cached.at(-1)!.timestamp).toISOString() : "",
        },
      };
    }

    // Fetch from Alpaca
    const cfg = await loadAlpacaConfig();
    if (!cfg) {
      throw new Error("Alpaca API keys not configured");
    }

    const headers = {
      "APCA-API-KEY-ID": cfg.apiKeyId,
      "APCA-API-SECRET-KEY": cfg.apiSecretKey,
    };

    const allBars: OHLCV[] = [];
    let pageToken: string | null = null;

    do {
      const url = new URL(`/v2/stocks/${encodeURIComponent(request.symbol)}/bars`, DATA_BASE_URL);
      url.searchParams.set("timeframe", timeframe);
      url.searchParams.set("start", request.startDate);
      url.searchParams.set("end", request.endDate);
      url.searchParams.set("limit", "10000");
      url.searchParams.set("adjustment", "split");
      if (pageToken) {
        url.searchParams.set("page_token", pageToken);
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Alpaca Data API error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as AlpacaBarsResponse;
      if (data.bars) {
        allBars.push(...data.bars.map(mapBar));
      }
      pageToken = data.next_page_token;
    } while (pageToken);

    log.info(`fetched ${allBars.length} bars for ${request.symbol} from Alpaca`);

    // Sort by timestamp ascending
    allBars.sort((a, b) => a.timestamp - b.timestamp);

    // Cache for next time
    await setCachedBars(
      request.symbol,
      timeframe,
      request.startDate,
      request.endDate,
      allBars,
    ).catch((err) => log.warn(`cache write failed: ${err}`));

    return {
      bars: allBars,
      source: "alpaca",
      cached: false,
      metadata: {
        fetchedAt: new Date().toISOString(),
        barCount: allBars.length,
        firstBar: allBars[0] ? new Date(allBars[0].timestamp).toISOString() : "",
        lastBar: allBars.at(-1) ? new Date(allBars.at(-1)!.timestamp).toISOString() : "",
      },
    };
  }
}
