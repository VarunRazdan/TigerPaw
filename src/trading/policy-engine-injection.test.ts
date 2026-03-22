/**
 * Tests verifying that tradingPolicyConfig is properly injected into the plugin API.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

describe("policy engine injection", () => {
  it("OpenClawConfig includes trading field", () => {
    const src = readFileSync(join(ROOT, "src/config/types.tigerpaw.ts"), "utf8");
    expect(src).toContain("trading?: TradingConfig");
    expect(src).toMatch(/import.*TradingConfig.*from.*trading\/config/);
  });

  it("OpenClawPluginApi includes tradingPolicyConfig field", () => {
    const src = readFileSync(join(ROOT, "src/plugins/types.ts"), "utf8");
    expect(src).toContain("tradingPolicyConfig?: TradingPolicyConfig");
    expect(src).toMatch(/import.*TradingPolicyConfig.*from.*trading\/policy-engine/);
  });

  it("createApi() injects tradingPolicyConfig from config.trading.policy", () => {
    const src = readFileSync(join(ROOT, "src/plugins/registry.ts"), "utf8");
    expect(src).toMatch(/tradingPolicyConfig:\s*params\.config\.trading\?\.policy/);
  });

  it("no extension uses unsafe as-unknown-as cast for tradingPolicyConfig", () => {
    const extensionsDir = join(ROOT, "extensions");
    const extensions = [
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

    for (const ext of extensions) {
      const path = join(extensionsDir, ext, "index.ts");
      let src: string;
      try {
        src = readFileSync(path, "utf8");
      } catch {
        continue; // Extension may not exist
      }
      expect(src, `${ext} still uses unsafe cast`).not.toMatch(
        /as\s+unknown\s+as\s*\{[^}]*tradingPolicyConfig/,
      );
    }
  });

  it("extensions use api.tradingPolicyConfig directly", () => {
    const extensionsDir = join(ROOT, "extensions");
    const extensions = [
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

    for (const ext of extensions) {
      const path = join(extensionsDir, ext, "index.ts");
      let src: string;
      try {
        src = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      if (src.includes("TradingPolicyEngine")) {
        expect(src, `${ext} should use api.tradingPolicyConfig`).toContain(
          "api.tradingPolicyConfig",
        );
      }
    }
  });
});
