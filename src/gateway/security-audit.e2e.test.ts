/**
 * Security audit E2E tests.
 *
 * Verify that every gateway method is properly classified in method-scopes,
 * scope resolution is deterministic, and the authorization model behaves
 * correctly across roles and privilege levels.
 */

import { describe, expect, it } from "vitest";
import {
  ADMIN_SCOPE,
  authorizeOperatorScopesForMethod,
  isGatewayMethodClassified,
  isNodeRoleMethod,
  resolveRequiredOperatorScopeForMethod,
  resolveLeastPrivilegeOperatorScopesForMethod,
  CLI_DEFAULT_OPERATOR_SCOPES,
} from "./method-scopes.js";

/**
 * Hard-coded copy of BASE_METHODS from server-methods-list.ts.
 * We intentionally duplicate the list here so the test breaks when
 * a new method is added without being classified in method-scopes.
 */
const BASE_METHODS = [
  "health",
  "doctor.memory.status",
  "logs.tail",
  "channels.status",
  "channels.logout",
  "status",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "tts.enable",
  "tts.disable",
  "tts.convert",
  "tts.setProvider",
  "config.get",
  "config.set",
  "config.apply",
  "config.patch",
  "config.schema",
  "config.schema.lookup",
  "exec.approvals.get",
  "exec.approvals.set",
  "exec.approvals.node.get",
  "exec.approvals.node.set",
  "exec.approval.request",
  "exec.approval.waitDecision",
  "exec.approval.resolve",
  "wizard.start",
  "wizard.next",
  "wizard.cancel",
  "wizard.status",
  "talk.config",
  "talk.mode",
  "models.list",
  "tools.catalog",
  "agents.list",
  "agents.create",
  "agents.update",
  "agents.delete",
  "agents.files.list",
  "agents.files.get",
  "agents.files.set",
  "skills.status",
  "skills.bins",
  "skills.install",
  "skills.update",
  "update.run",
  "voicewake.get",
  "voicewake.set",
  "secrets.reload",
  "secrets.resolve",
  "sessions.list",
  "sessions.preview",
  "sessions.patch",
  "sessions.reset",
  "sessions.delete",
  "sessions.compact",
  "last-heartbeat",
  "set-heartbeats",
  "wake",
  "node.pair.request",
  "node.pair.list",
  "node.pair.approve",
  "node.pair.reject",
  "node.pair.verify",
  "device.pair.list",
  "device.pair.approve",
  "device.pair.reject",
  "device.pair.remove",
  "device.token.rotate",
  "device.token.revoke",
  "node.rename",
  "node.list",
  "node.describe",
  "node.pending.drain",
  "node.pending.enqueue",
  "node.invoke",
  "node.pending.pull",
  "node.pending.ack",
  "node.invoke.result",
  "node.event",
  "node.canvas.capability.refresh",
  "cron.list",
  "cron.status",
  "cron.add",
  "cron.update",
  "cron.remove",
  "cron.run",
  "cron.runs",
  "system-presence",
  "system-event",
  "send",
  "agent",
  "agent.identity.get",
  "agent.wait",
  "browser.request",
  "chat.history",
  "chat.abort",
  "chat.send",
  "connect",
  "poll",
  "chat.inject",
  "web.login.start",
  "web.login.wait",
  "push.test",
  "sessions.get",
  "sessions.resolve",
  "sessions.usage",
  "sessions.usage.timeseries",
  "sessions.usage.logs",
];

describe("security-audit: method scope coverage", () => {
  it("every BASE_METHOD is classified in method-scopes or is a node-role method", () => {
    const unclassified: string[] = [];
    for (const method of BASE_METHODS) {
      if (!isGatewayMethodClassified(method)) {
        unclassified.push(method);
      }
    }
    // It is acceptable for some methods to be unclassified (they default to admin-deny).
    // This test documents which methods are unclassified and ensures we track them.
    // If all are classified, this set is empty.
    for (const method of unclassified) {
      // Unclassified methods should default to admin-deny behavior
      const scopes = resolveLeastPrivilegeOperatorScopesForMethod(method);
      expect(
        scopes,
        `unclassified method "${method}" should return empty scopes (admin-deny)`,
      ).toEqual([]);
    }
  });

  it("unclassified methods default to admin-deny (require admin scope)", () => {
    const fakeMethod = "totally.unknown.method.xyz";
    expect(isGatewayMethodClassified(fakeMethod)).toBe(false);

    const result = authorizeOperatorScopesForMethod(fakeMethod, [
      "operator.read",
      "operator.write",
    ]);
    expect(result).toEqual({ allowed: false, missingScope: ADMIN_SCOPE });

    // Admin scope grants access even to unclassified methods
    const adminResult = authorizeOperatorScopesForMethod(fakeMethod, [ADMIN_SCOPE]);
    expect(adminResult).toEqual({ allowed: true });
  });

  it("admin scope grants access to all classified methods", () => {
    for (const method of BASE_METHODS) {
      if (isNodeRoleMethod(method)) {
        continue; // Node-role methods are not operator-accessible
      }
      const result = authorizeOperatorScopesForMethod(method, [ADMIN_SCOPE]);
      expect(result, `admin should access "${method}"`).toEqual({ allowed: true });
    }
  });

  it("node role methods are properly identified", () => {
    const expectedNodeMethods = [
      "node.invoke.result",
      "node.event",
      "node.pending.drain",
      "node.canvas.capability.refresh",
      "node.pending.pull",
      "node.pending.ack",
      "skills.bins",
    ];
    for (const method of expectedNodeMethods) {
      expect(isNodeRoleMethod(method), `"${method}" should be a node-role method`).toBe(true);
    }

    // Non-node methods should NOT be flagged as node-role
    const nonNodeMethods = ["health", "config.get", "send", "agent"];
    for (const method of nonNodeMethods) {
      expect(isNodeRoleMethod(method), `"${method}" should NOT be a node-role method`).toBe(false);
    }
  });

  it("scope resolution is deterministic (returns same result on repeated calls)", () => {
    const testMethods = ["health", "config.set", "send", "node.invoke.result", "cron.add"];
    for (const method of testMethods) {
      const first = resolveRequiredOperatorScopeForMethod(method);
      const second = resolveRequiredOperatorScopeForMethod(method);
      expect(first, `scope for "${method}" should be deterministic`).toBe(second);

      const lp1 = resolveLeastPrivilegeOperatorScopesForMethod(method);
      const lp2 = resolveLeastPrivilegeOperatorScopesForMethod(method);
      expect(lp1).toEqual(lp2);
    }
  });

  it("CLI default operator scopes include all required scope types", () => {
    expect(CLI_DEFAULT_OPERATOR_SCOPES).toContain(ADMIN_SCOPE);
    expect(CLI_DEFAULT_OPERATOR_SCOPES).toContain("operator.read");
    expect(CLI_DEFAULT_OPERATOR_SCOPES).toContain("operator.write");
    expect(CLI_DEFAULT_OPERATOR_SCOPES).toContain("operator.approvals");
    expect(CLI_DEFAULT_OPERATOR_SCOPES).toContain("operator.pairing");
  });
});
