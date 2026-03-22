import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADING_CONFIG,
  resolveEffectiveApprovalMode,
  validateTradingConfig,
  type TradingConfig,
  type TradingConfigValidationError,
} from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone the default config and apply overrides. */
function makeConfig(overrides: Partial<TradingConfig> = {}): TradingConfig {
  const base = structuredClone(DEFAULT_TRADING_CONFIG);
  return { ...base, ...overrides };
}

/** Shorthand: build a live-mode config with valid defaults. */
function makeLiveConfig(
  limitOverrides: Partial<TradingConfig["policy"]["limits"]> = {},
): TradingConfig {
  const cfg = makeConfig({ mode: "live" });
  Object.assign(cfg.policy.limits, limitOverrides);
  return cfg;
}

/** Extract the `field` values from a list of validation errors. */
function errorFields(errors: TradingConfigValidationError[]): string[] {
  return errors.map((e) => e.field);
}

// ---------------------------------------------------------------------------
// DEFAULT_TRADING_CONFIG
// ---------------------------------------------------------------------------

describe("DEFAULT_TRADING_CONFIG", () => {
  it("has enabled=false", () => {
    expect(DEFAULT_TRADING_CONFIG.enabled).toBe(false);
  });

  it('has mode="paper"', () => {
    expect(DEFAULT_TRADING_CONFIG.mode).toBe("paper");
  });

  it('has tier="conservative"', () => {
    expect(DEFAULT_TRADING_CONFIG.policy.tier).toBe("conservative");
  });

  it('has approvalMode="manual"', () => {
    expect(DEFAULT_TRADING_CONFIG.policy.approvalMode).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// validateTradingConfig — paper mode
// ---------------------------------------------------------------------------

describe("validateTradingConfig — paper mode", () => {
  it("returns no errors for the default config", () => {
    const errors = validateTradingConfig(DEFAULT_TRADING_CONFIG);
    expect(errors).toEqual([]);
  });

  it("returns no errors even when limit values are relaxed (Infinity)", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxDailySpendUsd = Infinity;
    cfg.policy.limits.maxSingleTradeUsd = Infinity;
    cfg.policy.limits.maxTradesPerDay = Infinity;
    const errors = validateTradingConfig(cfg);
    expect(errors).toEqual([]);
  });

  it("returns no errors when limit values are zero in paper mode", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxDailySpendUsd = 0;
    cfg.policy.limits.maxSingleTradeUsd = 0;
    const errors = validateTradingConfig(cfg);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateTradingConfig — live mode limit fields
// ---------------------------------------------------------------------------

describe("validateTradingConfig — live mode limits", () => {
  /** All limit fields that require finite positive values in live mode. */
  const finitePositiveFields: Array<{
    key: keyof TradingConfig["policy"]["limits"];
    field: string;
  }> = [
    { key: "maxDailySpendUsd", field: "policy.limits.maxDailySpendUsd" },
    { key: "maxSingleTradeUsd", field: "policy.limits.maxSingleTradeUsd" },
    {
      key: "maxRiskPerTradePercent",
      field: "policy.limits.maxRiskPerTradePercent",
    },
    {
      key: "dailyLossLimitPercent",
      field: "policy.limits.dailyLossLimitPercent",
    },
    {
      key: "maxPortfolioDrawdownPercent",
      field: "policy.limits.maxPortfolioDrawdownPercent",
    },
    {
      key: "maxSinglePositionPercent",
      field: "policy.limits.maxSinglePositionPercent",
    },
    { key: "maxTradesPerDay", field: "policy.limits.maxTradesPerDay" },
    { key: "maxOpenPositions", field: "policy.limits.maxOpenPositions" },
    {
      key: "consecutiveLossPause",
      field: "policy.limits.consecutiveLossPause",
    },
  ];

  it("returns no errors for a valid live config with the default limits", () => {
    const cfg = makeLiveConfig();
    const errors = validateTradingConfig(cfg);
    expect(errors).toEqual([]);
  });

  describe.each(finitePositiveFields)("$field must be finite and positive", ({ key, field }) => {
    it("errors when set to Infinity", () => {
      const errors = validateTradingConfig(makeLiveConfig({ [key]: Infinity }));
      expect(errorFields(errors)).toContain(field);
    });

    it("errors when set to 0", () => {
      const errors = validateTradingConfig(makeLiveConfig({ [key]: 0 }));
      expect(errorFields(errors)).toContain(field);
    });

    it("errors when set to a negative value", () => {
      const errors = validateTradingConfig(makeLiveConfig({ [key]: -1 }));
      expect(errorFields(errors)).toContain(field);
    });

    it("errors when set to NaN", () => {
      const errors = validateTradingConfig(makeLiveConfig({ [key]: NaN }));
      expect(errorFields(errors)).toContain(field);
    });
  });

  describe("cooldownBetweenTradesMs must be finite and non-negative", () => {
    it("accepts 0 (no cooldown)", () => {
      const errors = validateTradingConfig(makeLiveConfig({ cooldownBetweenTradesMs: 0 }));
      expect(errorFields(errors).includes("policy.limits.cooldownBetweenTradesMs")).toBe(false);
    });

    it("accepts a positive value", () => {
      const errors = validateTradingConfig(makeLiveConfig({ cooldownBetweenTradesMs: 5000 }));
      expect(errorFields(errors).includes("policy.limits.cooldownBetweenTradesMs")).toBe(false);
    });

    it("errors when set to Infinity", () => {
      const errors = validateTradingConfig(makeLiveConfig({ cooldownBetweenTradesMs: Infinity }));
      expect(errorFields(errors)).toContain("policy.limits.cooldownBetweenTradesMs");
    });

    it("errors when set to a negative value", () => {
      const errors = validateTradingConfig(makeLiveConfig({ cooldownBetweenTradesMs: -1 }));
      expect(errorFields(errors)).toContain("policy.limits.cooldownBetweenTradesMs");
    });

    it("errors when set to NaN", () => {
      const errors = validateTradingConfig(makeLiveConfig({ cooldownBetweenTradesMs: NaN }));
      expect(errorFields(errors)).toContain("policy.limits.cooldownBetweenTradesMs");
    });
  });

  it("reports multiple errors when several limits are invalid", () => {
    const cfg = makeLiveConfig({
      maxDailySpendUsd: Infinity,
      maxSingleTradeUsd: 0,
      maxTradesPerDay: -5,
      cooldownBetweenTradesMs: -1,
    });
    const errors = validateTradingConfig(cfg);
    const fields = errorFields(errors);

    expect(fields).toContain("policy.limits.maxDailySpendUsd");
    expect(fields).toContain("policy.limits.maxSingleTradeUsd");
    expect(fields).toContain("policy.limits.maxTradesPerDay");
    expect(fields).toContain("policy.limits.cooldownBetweenTradesMs");
  });
});

// ---------------------------------------------------------------------------
// validateTradingConfig — auditLog
// ---------------------------------------------------------------------------

describe("validateTradingConfig — auditLog", () => {
  it("errors when maxFileSizeMb is 0", () => {
    const cfg = makeConfig();
    cfg.auditLog.maxFileSizeMb = 0;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).toContain("auditLog.maxFileSizeMb");
  });

  it("errors when maxFileSizeMb is negative", () => {
    const cfg = makeConfig();
    cfg.auditLog.maxFileSizeMb = -10;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).toContain("auditLog.maxFileSizeMb");
  });

  it("accepts a positive maxFileSizeMb", () => {
    const cfg = makeConfig();
    cfg.auditLog.maxFileSizeMb = 100;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors).includes("auditLog.maxFileSizeMb")).toBe(false);
  });

  it("errors when rotateCount is negative", () => {
    const cfg = makeConfig();
    cfg.auditLog.rotateCount = -1;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).toContain("auditLog.rotateCount");
  });

  it("accepts rotateCount of 0 (no rotation)", () => {
    const cfg = makeConfig();
    cfg.auditLog.rotateCount = 0;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors).includes("auditLog.rotateCount")).toBe(false);
  });

  it("reports both auditLog errors at once", () => {
    const cfg = makeConfig();
    cfg.auditLog.maxFileSizeMb = -1;
    cfg.auditLog.rotateCount = -1;
    const errors = validateTradingConfig(cfg);
    const fields = errorFields(errors);
    expect(fields).toContain("auditLog.maxFileSizeMb");
    expect(fields).toContain("auditLog.rotateCount");
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveApprovalMode
// ---------------------------------------------------------------------------

describe("resolveEffectiveApprovalMode", () => {
  it('paper mode + approvalMode="confirm" resolves to "auto"', () => {
    const cfg = makeConfig();
    cfg.policy.approvalMode = "confirm";
    const resolved = resolveEffectiveApprovalMode(cfg);
    expect(resolved.policy.approvalMode).toBe("auto");
  });

  it('paper mode + approvalMode="auto" stays "auto"', () => {
    const cfg = makeConfig();
    cfg.policy.approvalMode = "auto";
    const resolved = resolveEffectiveApprovalMode(cfg);
    expect(resolved.policy.approvalMode).toBe("auto");
  });

  it('paper mode + approvalMode="manual" stays "manual"', () => {
    const cfg = makeConfig();
    cfg.policy.approvalMode = "manual";
    const resolved = resolveEffectiveApprovalMode(cfg);
    expect(resolved.policy.approvalMode).toBe("manual");
  });

  it("live mode leaves approvalMode unchanged (auto)", () => {
    const cfg = makeConfig({ mode: "live" });
    cfg.policy.approvalMode = "auto";
    const resolved = resolveEffectiveApprovalMode(cfg);
    expect(resolved.policy.approvalMode).toBe("auto");
  });

  it("live mode leaves approvalMode unchanged (confirm)", () => {
    const cfg = makeConfig({ mode: "live" });
    cfg.policy.approvalMode = "confirm";
    const resolved = resolveEffectiveApprovalMode(cfg);
    expect(resolved.policy.approvalMode).toBe("confirm");
  });

  it("live mode leaves approvalMode unchanged (manual)", () => {
    const cfg = makeConfig({ mode: "live" });
    cfg.policy.approvalMode = "manual";
    const resolved = resolveEffectiveApprovalMode(cfg);
    expect(resolved.policy.approvalMode).toBe("manual");
  });

  it("does not mutate the original config", () => {
    const cfg = makeConfig();
    cfg.policy.approvalMode = "confirm";
    const original = structuredClone(cfg);
    resolveEffectiveApprovalMode(cfg);
    expect(cfg).toEqual(original);
  });
});
