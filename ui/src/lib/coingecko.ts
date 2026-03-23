/**
 * CoinGecko free API client with in-memory caching.
 * No API key needed. Rate limit: 30 calls/min.
 */

export type CryptoPrice = {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  lastUpdated: number;
};

type CoinGeckoPriceResponse = Record<string, { usd: number; usd_24h_change: number }>;

const COIN_IDS: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: "BTC", name: "Bitcoin" },
  ethereum: { symbol: "ETH", name: "Ethereum" },
  solana: { symbol: "SOL", name: "Solana" },
};

let priceCache: CryptoPrice[] = [];
let lastFetchMs = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  const now = Date.now();
  if (priceCache.length > 0 && now - lastFetchMs < CACHE_TTL_MS) {
    return priceCache;
  }

  try {
    const ids = Object.keys(COIN_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    );

    if (!res.ok) {
      // Return stale cache on rate limit / error
      return priceCache;
    }

    const data: CoinGeckoPriceResponse = await res.json();
    const prices: CryptoPrice[] = [];

    for (const [id, info] of Object.entries(COIN_IDS)) {
      const entry = data[id];
      if (entry) {
        prices.push({
          id,
          symbol: info.symbol,
          name: info.name,
          priceUsd: entry.usd,
          change24h: entry.usd_24h_change ?? 0,
          lastUpdated: now,
        });
      }
    }

    priceCache = prices;
    lastFetchMs = now;
    return prices;
  } catch {
    // Return stale cache on network error
    return priceCache;
  }
}
