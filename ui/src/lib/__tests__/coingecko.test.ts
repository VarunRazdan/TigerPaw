import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
  mockFetch.mockReset();
});

function makeApiResponse(btcPrice = 68_000, ethPrice = 3_800, solPrice = 145) {
  return {
    bitcoin: { usd: btcPrice, usd_24h_change: 2.5 },
    ethereum: { usd: ethPrice, usd_24h_change: -1.2 },
    solana: { usd: solPrice, usd_24h_change: 4.8 },
  };
}

describe("fetchCryptoPrices", () => {
  async function loadModule() {
    return import("../coingecko");
  }

  it("fetches from API on first call", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });
    const { fetchCryptoPrices } = await loadModule();
    const prices = await fetchCryptoPrices();
    expect(prices).toHaveLength(3);
    expect(prices[0].symbol).toBe("BTC");
    expect(prices[0].priceUsd).toBe(68_000);
    expect(prices[1].symbol).toBe("ETH");
    expect(prices[2].symbol).toBe("SOL");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached prices when cache is fresh (< 60s)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });
    const { fetchCryptoPrices } = await loadModule();
    await fetchCryptoPrices();
    // Advance 30s — still within 60s TTL
    vi.advanceTimersByTime(30_000);
    const prices = await fetchCryptoPrices();
    expect(prices).toHaveLength(3);
    // Should not have fetched again
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fetches again after cache expires (>= 60s)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(70_000)),
    });
    const { fetchCryptoPrices } = await loadModule();
    await fetchCryptoPrices();
    vi.advanceTimersByTime(61_000);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(72_000)),
    });
    const prices = await fetchCryptoPrices();
    expect(prices[0].priceUsd).toBe(72_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("parses 24h change correctly", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });
    const { fetchCryptoPrices } = await loadModule();
    const prices = await fetchCryptoPrices();
    expect(prices[0].change24h).toBe(2.5);
    expect(prices[1].change24h).toBe(-1.2);
  });

  it("returns stale cache on HTTP error", async () => {
    // First call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(65_000)),
    });
    const { fetchCryptoPrices } = await loadModule();
    await fetchCryptoPrices();
    // Expire cache
    vi.advanceTimersByTime(61_000);
    // Second call fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const prices = await fetchCryptoPrices();
    expect(prices[0].priceUsd).toBe(65_000);
  });

  it("returns stale cache on network error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(60_000)),
    });
    const { fetchCryptoPrices } = await loadModule();
    await fetchCryptoPrices();
    vi.advanceTimersByTime(61_000);
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const prices = await fetchCryptoPrices();
    expect(prices[0].priceUsd).toBe(60_000);
  });

  it("returns empty array on first call if API fails", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchCryptoPrices } = await loadModule();
    const prices = await fetchCryptoPrices();
    expect(prices).toEqual([]);
  });

  it("defaults change24h to 0 when missing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          bitcoin: { usd: 68_000 },
          ethereum: { usd: 3_800, usd_24h_change: -1 },
          solana: { usd: 145, usd_24h_change: null },
        }),
    });
    const { fetchCryptoPrices } = await loadModule();
    const prices = await fetchCryptoPrices();
    expect(prices[0].change24h).toBe(0);
  });
});
