import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRoutingDecisionsForTest,
  readRecentRoutingDecisions,
} from "../../agents/routing-decisions-buffer.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";

const mocks = vi.hoisted(() => ({
  applyMediaUnderstanding: vi.fn(async (..._args: unknown[]) => undefined),
  applyLinkUnderstanding: vi.fn(async (..._args: unknown[]) => undefined),
  createInternalHookEvent: vi.fn(),
  triggerInternalHook: vi.fn(async (..._args: unknown[]) => undefined),
  resolveReplyDirectives: vi.fn(),
  initSessionState: vi.fn(),
}));

// Mocks: minimal stand-ins for the modules getReplyFromConfig pulls in. We do
// NOT mock model-selection.js — the routing path calls findNormalizedProviderValue
// from it and we want the real lookup behavior.
vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentDir: vi.fn(() => "/tmp/agent"),
  resolveAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
  resolveSessionAgentId: vi.fn(() => "main"),
  resolveAgentSkillsFilter: vi.fn(() => undefined),
}));
vi.mock("../../agents/timeout.js", () => ({
  resolveAgentTimeoutMs: vi.fn(() => 60000),
}));
vi.mock("../../agents/workspace.js", () => ({
  DEFAULT_AGENT_WORKSPACE_DIR: "/tmp/workspace",
  ensureAgentWorkspace: vi.fn(async () => ({ dir: "/tmp/workspace" })),
}));
vi.mock("../../channels/model-overrides.js", () => ({
  resolveChannelModelOverride: vi.fn(() => undefined),
}));
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({})),
}));
vi.mock("../../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));
vi.mock("../command-auth.js", () => ({
  resolveCommandAuthorization: vi.fn(() => ({ isAuthorizedSender: true })),
}));
vi.mock("./directive-handling.js", () => ({
  resolveDefaultModel: vi.fn(() => ({
    defaultProvider: "openai",
    defaultModel: "gpt-4o-mini",
    aliasIndex: new Map(),
  })),
}));
vi.mock("./get-reply-run.js", () => ({
  runPreparedReply: vi.fn(async () => undefined),
}));
vi.mock("./inbound-context.js", () => ({
  finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
}));
vi.mock("./session-reset-model.js", () => ({
  applyResetModelOverride: vi.fn(async () => undefined),
}));
vi.mock("./stage-sandbox-media.js", () => ({
  stageSandboxMedia: vi.fn(async () => undefined),
}));
vi.mock("./typing.js", () => ({
  createTypingController: vi.fn(() => ({
    onReplyStart: async () => undefined,
    startTypingLoop: async () => undefined,
    startTypingOnText: async () => undefined,
    refreshTypingTtl: () => undefined,
    isActive: () => false,
    markRunComplete: () => undefined,
    markDispatchIdle: () => undefined,
    cleanup: () => undefined,
  })),
}));
vi.mock("../../globals.js", () => ({
  logVerbose: vi.fn(),
}));
vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: mocks.createInternalHookEvent,
  triggerInternalHook: mocks.triggerInternalHook,
}));
vi.mock("../../link-understanding/apply.js", () => ({
  applyLinkUnderstanding: mocks.applyLinkUnderstanding,
}));
vi.mock("../../media-understanding/apply.js", () => ({
  applyMediaUnderstanding: mocks.applyMediaUnderstanding,
}));
vi.mock("./commands-core.js", () => ({
  emitResetCommandHooks: vi.fn(async () => undefined),
}));
vi.mock("./get-reply-directives.js", () => ({
  resolveReplyDirectives: mocks.resolveReplyDirectives,
}));
vi.mock("./get-reply-inline-actions.js", () => ({
  handleInlineActions: vi.fn(async () => ({ kind: "reply", reply: { text: "ok" } })),
}));
vi.mock("./session.js", () => ({
  initSessionState: mocks.initSessionState,
}));

const { getReplyFromConfig } = await import("./get-reply.js");

const PROVIDERS = {
  perplexity: { baseUrl: "https://api.perplexity.ai", models: [{ id: "sonar-pro" }] },
  anthropic: { baseUrl: "https://api.anthropic.com", models: [{ id: "claude-opus-4-6" }] },
  openai: { baseUrl: "https://api.openai.com", models: [{ id: "gpt-4o-mini" }] },
};

function buildCfg(routing?: {
  enabled?: boolean;
  rules?: Array<{ intent: string; provider: string; model: string }>;
}): OpenClawConfig {
  return {
    agents: { defaults: { routing } },
    models: { providers: PROVIDERS },
  } as unknown as OpenClawConfig;
}

function buildCtx(overrides: Partial<MsgContext> = {}): MsgContext {
  return {
    Provider: "telegram",
    Surface: "telegram",
    OriginatingChannel: "telegram",
    OriginatingTo: "telegram:-100123",
    ChatType: "private",
    Body: "hello",
    BodyForAgent: "hello",
    RawBody: "hello",
    CommandBody: "hello",
    SessionKey: "agent:main:telegram:42",
    From: "telegram:user:42",
    To: "telegram:42",
    Timestamp: 1710000000000,
    ...overrides,
  } as MsgContext;
}

describe("getReplyFromConfig — routing telemetry", () => {
  beforeEach(() => {
    process.env.OPENCLAW_TEST_FAST = "1";
    __resetRoutingDecisionsForTest();
    mocks.resolveReplyDirectives.mockReset();
    mocks.initSessionState.mockReset();
    mocks.resolveReplyDirectives.mockResolvedValue({ kind: "reply", reply: { text: "ok" } });
    mocks.initSessionState.mockResolvedValue({
      sessionCtx: {},
      sessionEntry: {},
      previousSessionEntry: {},
      sessionStore: {},
      sessionKey: "agent:main:telegram:42",
      sessionId: "session-1",
      isNewSession: false,
      resetTriggered: false,
      systemSent: false,
      abortedLastRun: false,
      storePath: "/tmp/sessions.json",
      sessionScope: "per-chat",
      groupResolution: undefined,
      isGroup: false,
      triggerBodyNormalized: "",
      bodyStripped: "",
    });
  });

  it("records nothing when the inbound body is empty", async () => {
    await getReplyFromConfig(buildCtx({ Body: "" }), undefined, buildCfg());
    expect(readRecentRoutingDecisions()).toEqual([]);
  });

  it("records reason=disabled when routing is off", async () => {
    await getReplyFromConfig(
      buildCtx({ Body: "what's the latest weather forecast for NYC" }),
      undefined,
      buildCfg(),
    );
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(1);
    const decision = recent[0];
    expect(decision.routed).toBe(false);
    expect(decision.reason).toBe("disabled");
    expect(decision.intent).toBe("search");
    expect(decision.defaultProvider).toBe("openai");
    expect(decision.defaultModel).toBe("gpt-4o-mini");
    expect(decision.channel).toBe("telegram");
    expect(decision.sessionKey).toBe("agent:main:telegram:42");
    expect(decision.bodyPreview).toBe("what's the latest weather forecast for NYC");
  });

  it("records reason=general-intent when classifier returns general", async () => {
    await getReplyFromConfig(
      buildCtx({ Body: "hi there friend" }),
      undefined,
      buildCfg({
        enabled: true,
        rules: [{ intent: "search", provider: "perplexity", model: "sonar-pro" }],
      }),
    );
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.routed).toBe(false);
    expect(recent[0]?.reason).toBe("general-intent");
    expect(recent[0]?.intent).toBe("general");
  });

  it("records reason=no-rule when no rule matches the intent", async () => {
    await getReplyFromConfig(
      buildCtx({ Body: "weather forecast for tomorrow" }),
      undefined,
      buildCfg({
        enabled: true,
        rules: [{ intent: "code", provider: "anthropic", model: "claude-opus-4-6" }],
      }),
    );
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.routed).toBe(false);
    expect(recent[0]?.reason).toBe("no-rule");
    expect(recent[0]?.intent).toBe("search");
  });

  it("records reason=provider-unavailable when the rule's provider is not configured", async () => {
    const cfg = buildCfg({
      enabled: true,
      rules: [{ intent: "search", provider: "ghost-provider", model: "sonar-pro" }],
    });
    await getReplyFromConfig(buildCtx({ Body: "weather forecast for tomorrow" }), undefined, cfg);
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.routed).toBe(false);
    expect(recent[0]?.reason).toBe("provider-unavailable");
  });

  it("records routed=true when a rule matches and the provider is configured", async () => {
    await getReplyFromConfig(
      buildCtx({ Body: "find the latest news about Apple stock price" }),
      undefined,
      buildCfg({
        enabled: true,
        rules: [{ intent: "search", provider: "perplexity", model: "sonar-pro" }],
      }),
    );
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(1);
    const decision = recent[0];
    expect(decision.routed).toBe(true);
    expect(decision.intent).toBe("search");
    expect(decision.routedProvider).toBe("perplexity");
    expect(decision.routedModel).toBe("sonar-pro");
    expect(decision.defaultProvider).toBe("openai");
    expect(decision.defaultModel).toBe("gpt-4o-mini");
    expect(decision.reason).toBeUndefined();
  });

  it("truncates bodyPreview to 80 characters", async () => {
    const longBody = "search for ".repeat(20);
    await getReplyFromConfig(buildCtx({ Body: longBody }), undefined, buildCfg());
    const recent = readRecentRoutingDecisions();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.bodyPreview.length).toBeLessThanOrEqual(80);
  });
});
