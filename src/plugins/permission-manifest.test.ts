import { describe, expect, it } from "vitest";
import {
  formatPermissionsSummary,
  parseExtensionPermissions,
  validatePermissionManifest,
} from "./permission-manifest.js";

describe("parseExtensionPermissions", () => {
  it("returns undefined for null", () => {
    expect(parseExtensionPermissions(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(parseExtensionPermissions(undefined)).toBeUndefined();
  });

  it("returns undefined for array", () => {
    expect(parseExtensionPermissions([1, 2, 3])).toBeUndefined();
  });

  it("returns undefined for string", () => {
    expect(parseExtensionPermissions("trading")).toBeUndefined();
  });

  it("parses network as string array, filtering non-strings", () => {
    const result = parseExtensionPermissions({
      network: ["api.example.com", 123, null, "api.other.com"],
    });
    expect(result?.network).toEqual(["api.example.com", "api.other.com"]);
  });

  it("trims and filters empty strings from network", () => {
    const result = parseExtensionPermissions({
      network: ["  api.example.com  ", "", "  "],
    });
    expect(result?.network).toEqual(["api.example.com"]);
  });

  it("parses trading as boolean, ignores non-boolean", () => {
    expect(parseExtensionPermissions({ trading: true })?.trading).toBe(true);
    expect(parseExtensionPermissions({ trading: false })?.trading).toBe(false);
    expect(parseExtensionPermissions({ trading: "yes" })?.trading).toBeUndefined();
  });

  it("parses filesystem as boolean, ignores non-boolean", () => {
    expect(parseExtensionPermissions({ filesystem: true })?.filesystem).toBe(true);
    expect(parseExtensionPermissions({ filesystem: 1 })?.filesystem).toBeUndefined();
  });

  it("parses secrets as string array", () => {
    const result = parseExtensionPermissions({
      secrets: ["alpaca.apiKey", "alpaca.apiSecret"],
    });
    expect(result?.secrets).toEqual(["alpaca.apiKey", "alpaca.apiSecret"]);
  });

  it("returns empty-ish object for empty object input", () => {
    const result = parseExtensionPermissions({});
    expect(result).toBeDefined();
    expect(result?.trading).toBeUndefined();
    expect(result?.network).toBeUndefined();
    expect(result?.filesystem).toBeUndefined();
    expect(result?.secrets).toBeUndefined();
  });
});

describe("validatePermissionManifest", () => {
  it("returns valid=true with warning when no permissions provided", () => {
    const result = validatePermissionManifest(undefined);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No permissions declared");
  });

  it("returns valid=true with no warnings for well-formed permissions", () => {
    const result = validatePermissionManifest({
      trading: true,
      network: ["api.alpaca.markets"],
      secrets: ["alpaca.apiKey"],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when trading=true but no secrets declared", () => {
    const result = validatePermissionManifest({
      trading: true,
      network: ["api.example.com"],
    });
    expect(result.warnings.some((w) => w.includes("no secrets"))).toBe(true);
  });

  it("warns when trading=true but no network permissions declared", () => {
    const result = validatePermissionManifest({
      trading: true,
      secrets: ["some.secret"],
    });
    expect(result.warnings.some((w) => w.includes("no network"))).toBe(true);
  });

  it("does NOT warn when trading=false even if no secrets", () => {
    const result = validatePermissionManifest({
      trading: false,
      network: [],
    });
    expect(result.warnings).toHaveLength(0);
  });
});

describe("formatPermissionsSummary", () => {
  it("lists trading/network/filesystem/secrets lines", () => {
    const lines = formatPermissionsSummary({
      trading: true,
      network: ["api.a.com", "api.b.com"],
      filesystem: true,
      secrets: ["a.key", "b.key"],
    });
    expect(lines).toContainEqual(expect.stringContaining("trading"));
    expect(lines).toContainEqual(expect.stringContaining("api.a.com"));
    expect(lines).toContainEqual(expect.stringContaining("filesystem"));
    expect(lines).toContainEqual(expect.stringContaining("2 credential(s)"));
  });

  it("returns empty array when no permissions set", () => {
    const lines = formatPermissionsSummary({});
    expect(lines).toEqual([]);
  });
});
