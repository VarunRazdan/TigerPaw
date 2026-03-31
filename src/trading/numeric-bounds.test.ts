import { describe, expect, it } from "vitest";
import { validateTradingNumeric } from "./numeric-bounds.js";

describe("validateTradingNumeric", () => {
  // ── NaN ──────────────────────────────────────────────────────────
  it("rejects NaN", () => {
    expect(() => validateTradingNumeric("qty", NaN, 0, 100)).toThrow(
      "qty must be a valid number, got NaN",
    );
  });

  // ── Infinity ─────────────────────────────────────────────────────
  it("rejects Infinity", () => {
    expect(() => validateTradingNumeric("price", Infinity, 0, 100)).toThrow(
      "price must be finite, got Infinity",
    );
  });

  it("rejects -Infinity", () => {
    expect(() => validateTradingNumeric("price", -Infinity, 0, 100)).toThrow(
      "price must be finite, got -Infinity",
    );
  });

  // ── Negative values ──────────────────────────────────────────────
  it("rejects negative values when min is 0", () => {
    expect(() => validateTradingNumeric("qty", -1, 0, 100)).toThrow(
      "qty must be >= 0, got -1",
    );
  });

  // ── Zero ─────────────────────────────────────────────────────────
  it("accepts zero when min is 0", () => {
    expect(validateTradingNumeric("qty", 0, 0, 100)).toBe(0);
  });

  it("rejects zero when min is positive", () => {
    expect(() => validateTradingNumeric("qty", 0, 0.000001, 100)).toThrow(
      "qty must be >= 0.000001, got 0",
    );
  });

  // ── Boundary: exactly min ────────────────────────────────────────
  it("accepts value exactly at min", () => {
    expect(validateTradingNumeric("qty", 5, 5, 100)).toBe(5);
  });

  // ── Boundary: exactly max ────────────────────────────────────────
  it("accepts value exactly at max", () => {
    expect(validateTradingNumeric("qty", 100, 0, 100)).toBe(100);
  });

  // ── Above max ────────────────────────────────────────────────────
  it("rejects value above max", () => {
    expect(() => validateTradingNumeric("qty", 101, 0, 100)).toThrow(
      "qty must be <= 100, got 101",
    );
  });

  // ── Valid value in range ─────────────────────────────────────────
  it("returns valid value in the middle of the range", () => {
    expect(validateTradingNumeric("qty", 50, 0, 100)).toBe(50);
  });

  // ── Very small fractional values ─────────────────────────────────
  it("accepts very small fractional value above min", () => {
    expect(validateTradingNumeric("qty", 0.000001, 0.000001, 100)).toBe(0.000001);
  });

  it("rejects fractional value below min", () => {
    expect(() => validateTradingNumeric("qty", 0.0000001, 0.000001, 100)).toThrow(
      "qty must be >= 0.000001",
    );
  });

  // ── Number.MAX_SAFE_INTEGER ──────────────────────────────────────
  it("accepts Number.MAX_SAFE_INTEGER when max allows it", () => {
    expect(
      validateTradingNumeric("bigVal", Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects Number.MAX_SAFE_INTEGER when max is lower", () => {
    expect(() =>
      validateTradingNumeric("qty", Number.MAX_SAFE_INTEGER, 0, 1_000_000_000),
    ).toThrow("qty must be <= 1000000000");
  });

  // ── Descriptive error includes field name ────────────────────────
  it("includes field name in NaN error message", () => {
    expect(() => validateTradingNumeric("executedPrice", NaN, 0, 10_000_000)).toThrow(
      "executedPrice must be a valid number, got NaN",
    );
  });

  it("includes field name in above-max error message", () => {
    expect(() => validateTradingNumeric("slippageBps", 600, 0, 500)).toThrow(
      "slippageBps must be <= 500, got 600",
    );
  });
});
