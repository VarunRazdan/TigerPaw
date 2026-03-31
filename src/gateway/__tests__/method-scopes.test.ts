/**
 * Unit tests for gateway method-scope classification and authorization.
 *
 * Covers: scope classification for all method families, authorization logic,
 * prefix-based patterns, and completeness check against BASE_METHODS.
 */

import { describe, it, expect } from "vitest";
import {
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  authorizeOperatorScopesForMethod,
  isGatewayMethodClassified,
  isReadMethod,
  isAdminOnlyMethod,
  resolveRequiredOperatorScopeForMethod,
} from "../method-scopes.js";

// Hard-coded to avoid coupling to runtime channel plugin availability
// (listGatewayMethods() calls listChannelPlugins() which requires runtime state).
const BASE_METHODS: readonly string[] = [
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
  // Workflow engine
  "workflows.list",
  "workflows.get",
  "workflows.save",
  "workflows.delete",
  "workflows.toggle",
  "workflows.execute",
  "workflows.history",
  "workflows.execution",
  "workflows.clearHistory",
  "workflows.diagnostics",
  "workflows.import",
  "workflows.export",
  // Credential vault
  "workflows.credentials.list",
  "workflows.credentials.get",
  "workflows.credentials.save",
  "workflows.credentials.delete",
  "workflows.credentials.test",
  // Version history
  "workflows.versions.list",
  "workflows.versions.get",
  "workflows.versions.rollback",
  "workflows.versions.diff",
  "workflows.versions.clear",
  "workflows.webhook",
  "workflows.webhooks.list",
  // Integrations
  "integrations.providers",
  "integrations.connections",
  "integrations.connection.get",
  "integrations.oauth2.start",
  "integrations.oauth2.complete",
  "integrations.disconnect",
  "integrations.test",
  // MCP + Messages
  "mcp.servers.list",
  "mcp.tools.list",
  "messages.recent",
  // Trading state
  "trading.getState",
  "trading.getQuote",
  "trading.killSwitch.toggle",
  "trading.killSwitch.platform",
  "trading.recordFill",
  // Strategies
  "strategies.list",
  "strategies.get",
  "strategies.save",
  "strategies.delete",
  "strategies.toggle",
  "strategies.execute",
  "strategies.executions",
  "strategies.clearHistory",
  // Backtesting
  "backtest.run",
  "backtest.generate",
  // MCP server management
  "mcp.server.test",
  "mcp.server.refreshToken",
];

// ── Tests ────────────────────────────────────────────────────────────────

describe("method-scopes", () => {
  // ── Trading methods ─────────────────────────────────────────────────

  describe("trading method classification", () => {
    it("trading.getState is READ", () => {
      expect(isReadMethod("trading.getState")).toBe(true);
      expect(resolveRequiredOperatorScopeForMethod("trading.getState")).toBe(READ_SCOPE);
    });

    it("trading.getQuote is READ", () => {
      expect(isReadMethod("trading.getQuote")).toBe(true);
    });

    it("trading.killSwitch.toggle is ADMIN", () => {
      expect(isAdminOnlyMethod("trading.killSwitch.toggle")).toBe(true);
      expect(resolveRequiredOperatorScopeForMethod("trading.killSwitch.toggle")).toBe(ADMIN_SCOPE);
    });

    it("trading.killSwitch.platform is ADMIN", () => {
      expect(isAdminOnlyMethod("trading.killSwitch.platform")).toBe(true);
    });

    it("trading.recordFill is ADMIN", () => {
      expect(isAdminOnlyMethod("trading.recordFill")).toBe(true);
    });
  });

  // ── Strategy methods ────────────────────────────────────────────────

  describe("strategy method classification", () => {
    it("strategies.list is READ", () => {
      expect(isReadMethod("strategies.list")).toBe(true);
    });

    it("strategies.get is READ", () => {
      expect(isReadMethod("strategies.get")).toBe(true);
    });

    it("strategies.executions is READ", () => {
      expect(isReadMethod("strategies.executions")).toBe(true);
    });

    it("strategies.save is ADMIN", () => {
      expect(isAdminOnlyMethod("strategies.save")).toBe(true);
    });

    it("strategies.delete is ADMIN", () => {
      expect(isAdminOnlyMethod("strategies.delete")).toBe(true);
    });

    it("strategies.toggle is ADMIN", () => {
      expect(isAdminOnlyMethod("strategies.toggle")).toBe(true);
    });

    it("strategies.execute is ADMIN", () => {
      expect(isAdminOnlyMethod("strategies.execute")).toBe(true);
    });

    it("strategies.clearHistory is ADMIN", () => {
      expect(isAdminOnlyMethod("strategies.clearHistory")).toBe(true);
    });
  });

  // ── Backtest methods ────────────────────────────────────────────────

  describe("backtest method classification", () => {
    it("backtest.run is ADMIN", () => {
      expect(isAdminOnlyMethod("backtest.run")).toBe(true);
    });

    it("backtest.generate is ADMIN", () => {
      expect(isAdminOnlyMethod("backtest.generate")).toBe(true);
    });
  });

  // ── MCP methods ─────────────────────────────────────────────────────

  describe("MCP method classification", () => {
    it("mcp.servers.list is READ", () => {
      expect(isReadMethod("mcp.servers.list")).toBe(true);
    });

    it("mcp.tools.list is READ", () => {
      expect(isReadMethod("mcp.tools.list")).toBe(true);
    });

    it("mcp.server.test is ADMIN", () => {
      expect(isAdminOnlyMethod("mcp.server.test")).toBe(true);
    });

    it("mcp.server.refreshToken is ADMIN", () => {
      expect(isAdminOnlyMethod("mcp.server.refreshToken")).toBe(true);
    });
  });

  // ── Messages ────────────────────────────────────────────────────────

  describe("messages method classification", () => {
    it("messages.recent is READ", () => {
      expect(isReadMethod("messages.recent")).toBe(true);
      expect(resolveRequiredOperatorScopeForMethod("messages.recent")).toBe(READ_SCOPE);
    });
  });

  // ── Prefix-based patterns ──────────────────────────────────────────

  describe("prefix-based admin classification", () => {
    it("workflows.credentials.* methods resolve to ADMIN via prefix", () => {
      for (const method of [
        "workflows.credentials.list",
        "workflows.credentials.get",
        "workflows.credentials.save",
        "workflows.credentials.delete",
        "workflows.credentials.test",
      ]) {
        expect(resolveRequiredOperatorScopeForMethod(method)).toBe(ADMIN_SCOPE);
        expect(isGatewayMethodClassified(method)).toBe(true);
      }
    });

    it("workflows.versions.* methods resolve to ADMIN via prefix", () => {
      for (const method of [
        "workflows.versions.list",
        "workflows.versions.get",
        "workflows.versions.rollback",
        "workflows.versions.diff",
        "workflows.versions.clear",
      ]) {
        expect(resolveRequiredOperatorScopeForMethod(method)).toBe(ADMIN_SCOPE);
        expect(isGatewayMethodClassified(method)).toBe(true);
      }
    });

    it("config.* methods resolve to ADMIN via prefix", () => {
      // config.get and config.schema.lookup are explicit READ overrides
      expect(resolveRequiredOperatorScopeForMethod("config.set")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("config.apply")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("config.patch")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("config.schema")).toBe(ADMIN_SCOPE);
    });

    it("wizard.* methods resolve to ADMIN via prefix", () => {
      expect(resolveRequiredOperatorScopeForMethod("wizard.start")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("wizard.next")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("wizard.cancel")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("wizard.status")).toBe(ADMIN_SCOPE);
    });

    it("onboarding.* methods resolve to ADMIN via prefix", () => {
      expect(resolveRequiredOperatorScopeForMethod("onboarding.start")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("onboarding.anything")).toBe(ADMIN_SCOPE);
    });

    it("exec.approvals.* methods resolve to ADMIN via prefix", () => {
      expect(resolveRequiredOperatorScopeForMethod("exec.approvals.get")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("exec.approvals.set")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("exec.approvals.node.get")).toBe(ADMIN_SCOPE);
      expect(resolveRequiredOperatorScopeForMethod("exec.approvals.node.set")).toBe(ADMIN_SCOPE);
    });

    it("update.* methods resolve to ADMIN via prefix", () => {
      expect(resolveRequiredOperatorScopeForMethod("update.run")).toBe(ADMIN_SCOPE);
    });
  });

  // ── Authorization logic ────────────────────────────────────────────

  describe("authorizeOperatorScopesForMethod", () => {
    it("admin scope grants access to all methods", () => {
      expect(authorizeOperatorScopesForMethod("trading.getState", [ADMIN_SCOPE])).toEqual({
        allowed: true,
      });
      expect(authorizeOperatorScopesForMethod("strategies.save", [ADMIN_SCOPE])).toEqual({
        allowed: true,
      });
      expect(authorizeOperatorScopesForMethod("backtest.run", [ADMIN_SCOPE])).toEqual({
        allowed: true,
      });
    });

    it("read scope grants access to read methods", () => {
      expect(authorizeOperatorScopesForMethod("trading.getState", [READ_SCOPE])).toEqual({
        allowed: true,
      });
      expect(authorizeOperatorScopesForMethod("messages.recent", [READ_SCOPE])).toEqual({
        allowed: true,
      });
      expect(authorizeOperatorScopesForMethod("strategies.list", [READ_SCOPE])).toEqual({
        allowed: true,
      });
    });

    it("write scope also grants access to read methods", () => {
      expect(authorizeOperatorScopesForMethod("trading.getState", [WRITE_SCOPE])).toEqual({
        allowed: true,
      });
      expect(authorizeOperatorScopesForMethod("messages.recent", [WRITE_SCOPE])).toEqual({
        allowed: true,
      });
    });

    it("write scope does NOT grant access to admin methods", () => {
      const result = authorizeOperatorScopesForMethod("trading.killSwitch.toggle", [WRITE_SCOPE]);
      expect(result).toEqual({ allowed: false, missingScope: ADMIN_SCOPE });
    });

    it("read scope does NOT grant access to admin methods", () => {
      const result = authorizeOperatorScopesForMethod("strategies.save", [READ_SCOPE]);
      expect(result).toEqual({ allowed: false, missingScope: ADMIN_SCOPE });
    });

    it("denies access for unclassified methods without admin scope", () => {
      const result = authorizeOperatorScopesForMethod("totally.unknown.method", [
        READ_SCOPE,
        WRITE_SCOPE,
      ]);
      expect(result).toEqual({ allowed: false, missingScope: ADMIN_SCOPE });
    });

    it("admin scope grants access to unclassified methods", () => {
      expect(authorizeOperatorScopesForMethod("totally.unknown.method", [ADMIN_SCOPE])).toEqual({
        allowed: true,
      });
    });
  });

  // ── Completeness: every BASE_METHOD is classified ──────────────────

  describe("completeness", () => {
    it("every method in BASE_METHODS is classified in method-scopes", () => {
      const unclassified: string[] = [];
      for (const method of BASE_METHODS) {
        if (!isGatewayMethodClassified(method)) {
          unclassified.push(method);
        }
      }
      expect(unclassified).toEqual([]);
    });
  });
});
