/**
 * Security regression tests.
 *
 * Verify that the 3 confirmed vulnerabilities remain fixed:
 * 1. Policy engine bypass via unsafe casts
 * 2. Polymarket plaintext secret header
 * 3. Signature verification using wrong crypto API
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const EXTENSIONS_DIR = join(ROOT, "extensions");

// All trading extension directory names.
const TRADING_EXTENSIONS = [
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

function readExtension(name: string): string {
  const path = join(EXTENSIONS_DIR, name, "index.ts");
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

describe("security regression: policy engine bypass (Vuln 1)", () => {
  it("no extension uses unsafe `as unknown as` cast for tradingPolicyConfig", () => {
    const pattern = /as\s+unknown\s+as\s*\{[^}]*tradingPolicyConfig/;
    for (const ext of TRADING_EXTENSIONS) {
      const src = readExtension(ext);
      if (!src) {
        continue;
      }
      expect(src, `${ext}/index.ts still uses unsafe cast`).not.toMatch(pattern);
    }
  });

  it("all trading extensions with order tools have fail-safe blocks", () => {
    // Extensions that place orders should have `if (!policyEngine)` blocks.
    const orderExtensions = TRADING_EXTENSIONS.filter((name) => {
      const src = readExtension(name);
      return src.includes("policyEngine") && src.includes("evaluateOrder");
    });

    expect(orderExtensions.length).toBeGreaterThan(0);

    for (const ext of orderExtensions) {
      const src = readExtension(ext);
      expect(src, `${ext}/index.ts missing fail-safe block`).toContain("if (!policyEngine)");
    }
  });

  it("OpenClawPluginApi type includes tradingPolicyConfig field", () => {
    const typesPath = join(ROOT, "src/plugins/types.ts");
    const src = readFileSync(typesPath, "utf8");
    expect(src).toContain("tradingPolicyConfig");
  });

  it("createApi injects tradingPolicyConfig from config", () => {
    const registryPath = join(ROOT, "src/plugins/registry.ts");
    const src = readFileSync(registryPath, "utf8");
    expect(src).toMatch(/tradingPolicyConfig:\s*params\.config\.trading\?\.policy/);
  });
});

describe("security regression: Polymarket auth (Vuln 2)", () => {
  it("no POLY-SECRET header in polymarket extension", () => {
    const src = readExtension("polymarket");
    expect(src).not.toContain("POLY-SECRET");
  });

  it("uses HMAC signature header instead", () => {
    const src = readExtension("polymarket");
    expect(src).toContain("POLY-SIGNATURE");
    expect(src).toContain("createHmac");
  });

  it("buildClobHeaders signs with method, path, and body", () => {
    const src = readExtension("polymarket");
    // The function signature should accept method, path, body params
    expect(src).toMatch(/buildClobHeaders\(cfg.*method.*path.*body/);
  });
});

describe("security regression: signature verification crypto (Vuln 3)", () => {
  it("does not use createVerify (RSA API) for Ed25519", () => {
    const sigPath = join(ROOT, "src/plugins/signature-verify.ts");
    const src = readFileSync(sigPath, "utf8");
    expect(src).not.toContain("createVerify");
  });

  it("uses crypto.verify for Ed25519 verification", () => {
    const sigPath = join(ROOT, "src/plugins/signature-verify.ts");
    const src = readFileSync(sigPath, "utf8");
    expect(src).toMatch(/crypto\.verify\(/);
  });

  it("uses crypto.createPublicKey to parse PEM", () => {
    const sigPath = join(ROOT, "src/plugins/signature-verify.ts");
    const src = readFileSync(sigPath, "utf8");
    expect(src).toMatch(/crypto\.createPublicKey\(/);
  });
});
