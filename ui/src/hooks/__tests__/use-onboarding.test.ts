import { describe, expect, it, vi } from "vitest";

// Mock stores and libs that use-onboarding.ts imports but aren't needed for pure-function tests
vi.mock("@/lib/gateway-rpc", () => ({ gatewayRpc: vi.fn() }));
vi.mock("@/lib/save-config", () => ({ saveConfigPatch: vi.fn() }));
vi.mock("@/stores/app-store", () => ({
  useAppStore: Object.assign(
    vi.fn(() => vi.fn()),
    { getState: vi.fn(() => ({})) },
  ),
}));
vi.mock("@/stores/integration-store", () => ({
  useIntegrationStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ setDemoMode: vi.fn() })),
  }),
}));
vi.mock("@/stores/message-hub-store", () => ({
  useMessageHubStore: Object.assign(vi.fn(), { getState: vi.fn(() => ({ setDemoMode: vi.fn() })) }),
}));
vi.mock("@/stores/notification-store", () => ({
  useNotificationStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ setDemoMode: vi.fn() })),
  }),
}));
vi.mock("@/stores/trading-store", () => ({
  useTradingStore: Object.assign(
    vi.fn(() => vi.fn()),
    { getState: vi.fn(() => ({})) },
  ),
}));
vi.mock("@/stores/workflow-store", () => ({
  useWorkflowStore: Object.assign(vi.fn(), { getState: vi.fn(() => ({ setDemoMode: vi.fn() })) }),
}));

import { buildAiConfigPatch } from "../use-onboarding";

describe("buildAiConfigPatch", () => {
  it("anthropic: anthropic-messages with apiKey", () => {
    const patch = buildAiConfigPatch("anthropic", { apiKey: "sk-ant-123" });
    expect(patch).toEqual({
      models: { providers: { anthropic: { type: "anthropic-messages", apiKey: "sk-ant-123" } } },
    });
  });

  it("openai: openai-completions with apiKey", () => {
    const patch = buildAiConfigPatch("openai", { apiKey: "sk-oai-456" });
    expect(patch).toEqual({
      models: { providers: { openai: { type: "openai-completions", apiKey: "sk-oai-456" } } },
    });
  });

  it("google: google-generative-ai with apiKey", () => {
    const patch = buildAiConfigPatch("google", { apiKey: "AIza-789" });
    expect(patch).toEqual({
      models: { providers: { google: { type: "google-generative-ai", apiKey: "AIza-789" } } },
    });
  });

  it("deepseek: openai-completions with deepseek baseUrl", () => {
    expect(buildAiConfigPatch("deepseek", { apiKey: "ds-key" })).toEqual({
      models: {
        providers: {
          deepseek: {
            type: "openai-completions",
            baseUrl: "https://api.deepseek.com",
            apiKey: "ds-key",
          },
        },
      },
    });
  });

  it("groq: openai-completions with groq baseUrl", () => {
    expect(buildAiConfigPatch("groq", { apiKey: "gsk-key" })).toEqual({
      models: {
        providers: {
          groq: {
            type: "openai-completions",
            baseUrl: "https://api.groq.com/openai",
            apiKey: "gsk-key",
          },
        },
      },
    });
  });

  it("mistral: openai-completions with mistral baseUrl", () => {
    expect(buildAiConfigPatch("mistral", { apiKey: "mis-key" })).toEqual({
      models: {
        providers: {
          mistral: {
            type: "openai-completions",
            baseUrl: "https://api.mistral.ai",
            apiKey: "mis-key",
          },
        },
      },
    });
  });

  it("xai: openai-completions with x.ai baseUrl", () => {
    expect(buildAiConfigPatch("xai", { apiKey: "xai-key" })).toEqual({
      models: {
        providers: {
          xai: {
            type: "openai-completions",
            baseUrl: "https://api.x.ai",
            apiKey: "xai-key",
          },
        },
      },
    });
  });

  it("perplexity: openai-completions with perplexity baseUrl", () => {
    expect(buildAiConfigPatch("perplexity", { apiKey: "pplx-key" })).toEqual({
      models: {
        providers: {
          perplexity: {
            type: "openai-completions",
            baseUrl: "https://api.perplexity.ai",
            apiKey: "pplx-key",
          },
        },
      },
    });
  });

  it("ollama: ollama type with default baseUrl", () => {
    expect(buildAiConfigPatch("ollama", {})).toEqual({
      models: {
        providers: { ollama: { type: "ollama", baseUrl: "http://localhost:11434" } },
      },
    });
  });

  it("ollama: ollama type with custom baseUrl", () => {
    expect(buildAiConfigPatch("ollama", { baseUrl: "http://192.168.1.5:11434" })).toEqual({
      models: {
        providers: { ollama: { type: "ollama", baseUrl: "http://192.168.1.5:11434" } },
      },
    });
  });

  it("lmstudio: openai-completions with localhost:1234 default", () => {
    expect(buildAiConfigPatch("lmstudio", {})).toEqual({
      models: {
        providers: {
          lmstudio: { type: "openai-completions", baseUrl: "http://localhost:1234" },
        },
      },
    });
  });

  it("custom: includes baseUrl and apiKey", () => {
    expect(buildAiConfigPatch("custom", { baseUrl: "https://my-api.com", apiKey: "abc" })).toEqual({
      models: {
        providers: {
          custom: { type: "openai-completions", baseUrl: "https://my-api.com", apiKey: "abc" },
        },
      },
    });
  });

  it("unknown provider returns empty object", () => {
    expect(buildAiConfigPatch("nonexistent", { apiKey: "key" })).toEqual({});
  });
});
