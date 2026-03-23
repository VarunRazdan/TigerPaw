import { describe, expect, it } from "vitest";
import { isOrderAllowedUnderKillSwitch, type KillSwitchStatus } from "./kill-switch.js";

// ---------------------------------------------------------------------------
// Tests — isOrderAllowedUnderKillSwitch (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe("isOrderAllowedUnderKillSwitch edge cases", () => {
  it("allows all orders when inactive", () => {
    const inactive: KillSwitchStatus = { active: false };

    expect(isOrderAllowedUnderKillSwitch(inactive, "buy")).toBe(true);
    expect(isOrderAllowedUnderKillSwitch(inactive, "sell")).toBe(true);
    expect(isOrderAllowedUnderKillSwitch(inactive, "cancel")).toBe(true);
  });

  it("blocks all orders in hard mode", () => {
    const hardActive: KillSwitchStatus = {
      active: true,
      mode: "hard",
      activatedAt: Date.now(),
      activatedBy: "system",
      reason: "daily loss exceeded",
    };

    expect(isOrderAllowedUnderKillSwitch(hardActive, "buy")).toBe(false);
    expect(isOrderAllowedUnderKillSwitch(hardActive, "sell")).toBe(false);
    expect(isOrderAllowedUnderKillSwitch(hardActive, "cancel")).toBe(false);
  });

  it("allows sells in soft mode", () => {
    const softActive: KillSwitchStatus = {
      active: true,
      mode: "soft",
      activatedAt: Date.now(),
      activatedBy: "operator",
      reason: "reducing exposure",
    };

    expect(isOrderAllowedUnderKillSwitch(softActive, "sell")).toBe(true);
    expect(isOrderAllowedUnderKillSwitch(softActive, "buy")).toBe(false);
  });

  it("allows cancels in soft mode", () => {
    const softActive: KillSwitchStatus = {
      active: true,
      mode: "soft",
      activatedAt: Date.now(),
      activatedBy: "operator",
      reason: "reducing exposure",
    };

    expect(isOrderAllowedUnderKillSwitch(softActive, "cancel")).toBe(true);
  });
});
