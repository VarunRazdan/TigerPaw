import { describe, expect, it } from "vitest";
import { TRADING_CONNECT_INFO, CHANNEL_CONNECT_INFO } from "../connect-config";

const EXPECTED_TRADING_PLATFORMS = [
  "alpaca",
  "polymarket",
  "kalshi",
  "manifold",
  "coinbase",
  "ibkr",
  "binance",
  "kraken",
  "dydx",
];

describe("TRADING_CONNECT_INFO", () => {
  it("contains all 9 trading platforms", () => {
    const keys = Object.keys(TRADING_CONNECT_INFO).toSorted();
    expect(keys).toEqual(EXPECTED_TRADING_PLATFORMS.toSorted());
  });

  it("every entry has required fields", () => {
    for (const [id, info] of Object.entries(TRADING_CONNECT_INFO)) {
      expect(info.name, `${id}.name`).toBeTruthy();
      expect(info.iconPath, `${id}.iconPath`).toContain(".svg");
      expect(info.setupUrl, `${id}.setupUrl`).toMatch(/^https?:\/\//);
      expect(info.description, `${id}.description`).toBeTruthy();
      expect(info.configSection, `${id}.configSection`).toBeTruthy();
      expect(Array.isArray(info.steps), `${id}.steps`).toBe(true);
      expect(info.steps.length, `${id}.steps.length`).toBeGreaterThan(0);
      expect(typeof info.hasSandbox, `${id}.hasSandbox`).toBe("boolean");
    }
  });

  it("every credential has field, label, and help", () => {
    for (const [id, info] of Object.entries(TRADING_CONNECT_INFO)) {
      for (const cred of info.credentials) {
        expect(cred.field, `${id}.${cred.field}.field`).toBeTruthy();
        expect(cred.label, `${id}.${cred.field}.label`).toBeTruthy();
        expect(cred.help, `${id}.${cred.field}.help`).toBeTruthy();
      }
    }
  });

  it("non-sensitive fields are marked sensitive:false", () => {
    const kalshi = TRADING_CONNECT_INFO.kalshi;
    const email = kalshi.credentials.find((c) => c.field === "email");
    expect(email?.sensitive).toBe(false);
    const keyPath = kalshi.credentials.find((c) => c.field === "privateKeyPath");
    expect(keyPath?.sensitive).toBe(false);

    const ibkr = TRADING_CONNECT_INFO.ibkr;
    const accountId = ibkr.credentials.find((c) => c.field === "accountId");
    expect(accountId?.sensitive).toBe(false);
    const gatewayHost = ibkr.credentials.find((c) => c.field === "gatewayHost");
    expect(gatewayHost?.sensitive).toBe(false);
  });

  it("configSection follows expected pattern for trading platforms", () => {
    for (const info of Object.values(TRADING_CONNECT_INFO)) {
      expect(info.configSection).toMatch(/^plugins\.entries\.\w+\.config$/);
    }
  });
});

describe("CHANNEL_CONNECT_INFO", () => {
  it("contains at least 10 messaging channels", () => {
    const keys = Object.keys(CHANNEL_CONNECT_INFO);
    expect(keys.length).toBeGreaterThanOrEqual(10);
  });

  it("every entry has required fields", () => {
    for (const [id, info] of Object.entries(CHANNEL_CONNECT_INFO)) {
      expect(info.name, `${id}.name`).toBeTruthy();
      expect(info.iconPath, `${id}.iconPath`).toContain(".svg");
      expect(info.setupUrl, `${id}.setupUrl`).toMatch(/^https?:\/\//);
      expect(info.description, `${id}.description`).toBeTruthy();
      expect(info.configSection, `${id}.configSection`).toBeTruthy();
      expect(Array.isArray(info.steps), `${id}.steps`).toBe(true);
      expect(info.steps.length, `${id}.steps.length`).toBeGreaterThan(0);
    }
  });

  it("no duplicate configSection values across trading + channels", () => {
    const allSections = [
      ...Object.values(TRADING_CONNECT_INFO).map((i) => i.configSection),
      ...Object.values(CHANNEL_CONNECT_INFO).map((i) => i.configSection),
    ];
    const unique = new Set(allSections);
    expect(unique.size).toBe(allSections.length);
  });

  it("channel configSection does not use plugins.entries prefix", () => {
    for (const info of Object.values(CHANNEL_CONNECT_INFO)) {
      expect(info.configSection).not.toMatch(/^plugins\./);
    }
  });
});
