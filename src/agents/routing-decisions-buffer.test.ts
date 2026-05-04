import { beforeEach, describe, expect, it } from "vitest";
import type { RoutingDecision } from "./model-routing.js";
import {
  __resetRoutingDecisionsForTest,
  readRecentRoutingDecisions,
  recordRoutingDecision,
} from "./routing-decisions-buffer.js";

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    ts: Date.now(),
    bodyPreview: "test message",
    intent: "general",
    confidence: "high",
    defaultProvider: "anthropic",
    defaultModel: "claude-opus-4-6",
    routed: false,
    reason: "general-intent",
    ...overrides,
  };
}

describe("routing-decisions-buffer", () => {
  beforeEach(() => {
    __resetRoutingDecisionsForTest();
  });

  it("returns an empty array when no decisions are recorded", () => {
    expect(readRecentRoutingDecisions()).toEqual([]);
  });

  it("returns recorded decisions newest-first", () => {
    recordRoutingDecision(makeDecision({ ts: 1, bodyPreview: "first" }));
    recordRoutingDecision(makeDecision({ ts: 2, bodyPreview: "second" }));
    recordRoutingDecision(makeDecision({ ts: 3, bodyPreview: "third" }));
    const recent = readRecentRoutingDecisions();
    expect(recent.map((d) => d.bodyPreview)).toEqual(["third", "second", "first"]);
  });

  it("caps the buffer at 100 entries (FIFO eviction)", () => {
    for (let i = 0; i < 150; i++) {
      recordRoutingDecision(makeDecision({ ts: i, bodyPreview: `msg-${i}` }));
    }
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(100);
    // Newest first: msg-149 down to msg-50.
    expect(recent[0]?.bodyPreview).toBe("msg-149");
    expect(recent[recent.length - 1]?.bodyPreview).toBe("msg-50");
  });

  it("respects an explicit limit", () => {
    for (let i = 0; i < 20; i++) {
      recordRoutingDecision(makeDecision({ ts: i, bodyPreview: `msg-${i}` }));
    }
    const recent = readRecentRoutingDecisions(5);
    expect(recent).toHaveLength(5);
    expect(recent.map((d) => d.bodyPreview)).toEqual([
      "msg-19",
      "msg-18",
      "msg-17",
      "msg-16",
      "msg-15",
    ]);
  });

  it("ignores non-positive limits and returns all entries", () => {
    recordRoutingDecision(makeDecision({ bodyPreview: "a" }));
    recordRoutingDecision(makeDecision({ bodyPreview: "b" }));
    expect(readRecentRoutingDecisions(0).map((d) => d.bodyPreview)).toEqual(["b", "a"]);
    expect(readRecentRoutingDecisions(-5).map((d) => d.bodyPreview)).toEqual(["b", "a"]);
  });

  it("__resetRoutingDecisionsForTest empties the buffer", () => {
    recordRoutingDecision(makeDecision());
    recordRoutingDecision(makeDecision());
    __resetRoutingDecisionsForTest();
    expect(readRecentRoutingDecisions()).toEqual([]);
  });
});
