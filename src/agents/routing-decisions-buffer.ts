import type { RoutingDecision } from "./model-routing.js";

const MAX = 100;
const decisions: RoutingDecision[] = [];

export function recordRoutingDecision(decision: RoutingDecision): void {
  decisions.push(decision);
  if (decisions.length > MAX) {
    decisions.splice(0, decisions.length - MAX);
  }
}

export function readRecentRoutingDecisions(limit?: number): RoutingDecision[] {
  const cap = typeof limit === "number" && limit > 0 ? Math.floor(limit) : decisions.length;
  const start = Math.max(0, decisions.length - cap);
  return decisions.slice(start).toReversed();
}

export function __resetRoutingDecisionsForTest(): void {
  decisions.length = 0;
}
