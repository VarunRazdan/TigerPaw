/**
 * Numeric bounds validation for trading inputs.
 *
 * Prevents DoS via unreasonable values (extreme quantities, prices, etc.)
 * by validating that numeric inputs are finite and within defined bounds.
 */

// ── Constants ────────────────────────────────────────────────────────

export const MAX_QUANTITY = 1_000_000_000;
export const MAX_PRICE_USD = 10_000_000;
export const MAX_NOTIONAL_USD = 100_000_000;
export const MAX_BACKTEST_DAYS = 3650;
export const MAX_INITIAL_CAPITAL_USD = 1_000_000_000;
export const MAX_SLIPPAGE_BPS = 500;
export const MAX_COMMISSION_PERCENT = 10;
export const MAX_START_PRICE = 1_000_000;
export const MAX_TRADE_HISTORY_LIMIT = 1000;
export const MIN_QUANTITY = 0.000001;

// ── Validation ───────────────────────────────────────────────────────

/**
 * Validate that a numeric value is finite and within [min, max].
 * Throws a descriptive error on NaN, Infinity, -Infinity, or out-of-range.
 * Returns the validated value on success.
 */
export function validateTradingNumeric(
  name: string,
  value: number,
  min: number,
  max: number,
): number {
  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a valid number, got NaN`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite, got ${value}`);
  }
  if (value < min) {
    throw new Error(`${name} must be >= ${min}, got ${value}`);
  }
  if (value > max) {
    throw new Error(`${name} must be <= ${max}, got ${value}`);
  }
  return value;
}
