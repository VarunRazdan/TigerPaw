/**
 * Tests for the onboarding gateway RPC handlers.
 *
 * Mocks `fetch` to validate handler logic without hitting real APIs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onboardingHandlers } from "../onboarding.js";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── onboarding.test ────────────────────────────────────────────

describe("onboarding.test", () => {
  const handler = onboardingHandlers["onboarding.test"];

  it("rejects missing provider", async () => {
    const { opts, respond } = makeOpts("onboarding.test", { credentials: {} });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "provider is required" }),
    );
  });

  it("rejects missing credentials", async () => {
    const { opts, respond } = makeOpts("onboarding.test", { provider: "openai" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "credentials object is required" }),
    );
  });

  it("rejects array credentials", async () => {
    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "openai",
      credentials: [1, 2],
    });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "credentials object is required" }),
    );
  });

  it("returns success for valid Anthropic key", async () => {
    mockFetch(async () => jsonResponse({ data: [] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "anthropic",
      credentials: { apiKey: "sk-ant-test" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: true, detail: "API key valid" }, undefined);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "sk-ant-test" }),
      }),
    );
  });

  it("returns error for invalid Anthropic key (401)", async () => {
    mockFetch(async () => jsonResponse({ error: "unauthorized" }, 401));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "anthropic",
      credentials: { apiKey: "bad-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: false, error: "Invalid API key" }, undefined);
  });

  it("returns success for valid OpenAI key with model count", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "gpt-4" }, { id: "gpt-3.5-turbo" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "openai",
      credentials: { apiKey: "sk-test" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "2 models available" },
      undefined,
    );
  });

  it("returns success for valid Ollama connection", async () => {
    mockFetch(async () => jsonResponse({ models: [{ name: "llama2" }, { name: "mistral" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "ollama",
      credentials: { baseUrl: "http://localhost:11434" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "2 models available" },
      undefined,
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.anything(),
    );
  });

  it("returns success for valid Google key", async () => {
    mockFetch(async () => jsonResponse({ models: [{ name: "gemini-pro" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "google",
      credentials: { apiKey: "google-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
  });

  it("returns error for invalid Google key (403)", async () => {
    mockFetch(async () => jsonResponse({}, 403));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "google",
      credentials: { apiKey: "bad" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: false, error: "Invalid API key" }, undefined);
  });

  it("returns success for valid DeepSeek key", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "deepseek-chat" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "deepseek",
      credentials: { apiKey: "ds-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
  });

  it("returns success for valid Groq key", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "llama-3" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "groq",
      credentials: { apiKey: "gsk-test" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
  });

  it("returns success for valid Mistral key", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "mistral-large" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "mistral",
      credentials: { apiKey: "ms-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
  });

  it("returns success for valid xAI key", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "grok-2" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "xai",
      credentials: { apiKey: "xai-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
  });

  it("returns success for valid Perplexity key", async () => {
    mockFetch(async () => jsonResponse({ choices: [] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "perplexity",
      credentials: { apiKey: "pplx-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: true, detail: "API key valid" }, undefined);
  });

  it("returns success for valid Discord bot token", async () => {
    mockFetch(async () => jsonResponse({ username: "TigerpawBot" }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "discord",
      credentials: { token: "bot-token" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: true, detail: "Bot: TigerpawBot" }, undefined);
  });

  it("returns success for valid Telegram bot token", async () => {
    mockFetch(async () => jsonResponse({ ok: true, result: { first_name: "Jarvis" } }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "telegram",
      credentials: { botToken: "tg-token" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: true, detail: "Bot: Jarvis" }, undefined);
  });

  it("returns success for valid Slack bot token", async () => {
    mockFetch(async () => jsonResponse({ ok: true, team: "MyTeam" }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "slack",
      credentials: { botToken: "xoxb-test" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: true, detail: "Team: MyTeam" }, undefined);
  });

  it("returns error for invalid Slack token", async () => {
    mockFetch(async () => jsonResponse({ ok: false, error: "invalid_auth" }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "slack",
      credentials: { botToken: "bad" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: false, error: "invalid_auth" }, undefined);
  });

  it("returns success for valid Alpaca paper credentials", async () => {
    mockFetch(async () => jsonResponse({ account_number: "12345" }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "alpaca",
      credentials: { apiKeyId: "key", apiSecretKey: "secret", mode: "paper" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "Account verified (paper)" },
      undefined,
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://paper-api.alpaca.markets/v2/account",
      expect.anything(),
    );
  });

  it("returns success for valid Coinbase credentials", async () => {
    mockFetch(async () => jsonResponse({ data: { id: "user" } }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "coinbase",
      credentials: { apiKey: "cb-key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { ok: true, detail: "Account verified" }, undefined);
  });

  it("returns error for custom provider without base URL", async () => {
    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "custom",
      credentials: {},
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: false, error: "Base URL is required" },
      undefined,
    );
  });

  it("returns success for valid custom provider", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "model-1" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "custom",
      credentials: { baseUrl: "http://my-llm:8080", apiKey: "key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
  });

  it("handles timeout errors gracefully", async () => {
    mockFetch(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "anthropic",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: false, error: "Service not reachable (timeout)" },
      undefined,
    );
  });

  it("handles network errors gracefully", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "ollama",
      credentials: { baseUrl: "http://localhost:11434" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: false, error: "Service not reachable" },
      undefined,
    );
  });

  it("returns success for unknown providers (pass-through)", async () => {
    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "some-future-provider",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "Credentials saved" },
      undefined,
    );
  });

  it("returns success for valid LM Studio connection", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "local-model" }] }));

    const { opts, respond } = makeOpts("onboarding.test", {
      provider: "lmstudio",
      credentials: { baseUrl: "http://localhost:1234" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: true, detail: "1 models available" },
      undefined,
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:1234/v1/models",
      expect.anything(),
    );
  });
});

// ── onboarding.models ──────────────────────────────────────────

describe("onboarding.models", () => {
  const handler = onboardingHandlers["onboarding.models"];

  it("rejects missing provider", async () => {
    const { opts, respond } = makeOpts("onboarding.models", { credentials: {} });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "provider is required" }),
    );
  });

  it("rejects missing credentials", async () => {
    const { opts, respond } = makeOpts("onboarding.models", { provider: "openai" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "credentials object is required" }),
    );
  });

  it("returns Anthropic models", async () => {
    mockFetch(async () =>
      jsonResponse({
        data: [
          { id: "claude-3-opus-20240229", display_name: "Claude 3 Opus" },
          { id: "claude-3-sonnet-20240229", display_name: "Claude 3 Sonnet" },
        ],
      }),
    );

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "anthropic",
      credentials: { apiKey: "sk-ant-test" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        ok: true,
        models: [
          { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
          { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
        ],
      },
      undefined,
    );
  });

  it("returns OpenAI models (filtering non-chat)", async () => {
    mockFetch(async () =>
      jsonResponse({
        data: [
          { id: "gpt-4" },
          { id: "gpt-3.5-turbo" },
          { id: "text-embedding-ada-002" },
          { id: "tts-1" },
          { id: "whisper-1" },
          { id: "dall-e-3" },
        ],
      }),
    );

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "openai",
      credentials: { apiKey: "sk-test" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      ok: boolean;
      models: { id: string }[];
    };
    expect(result.ok).toBe(true);
    // Should only include gpt-4 and gpt-3.5-turbo (filtered out embeddings, tts, whisper, dall-e)
    expect(result.models).toHaveLength(2);
    expect(result.models.map((m) => m.id)).toContain("gpt-4");
    expect(result.models.map((m) => m.id)).toContain("gpt-3.5-turbo");
  });

  it("returns Google models (filtering for gemini)", async () => {
    mockFetch(async () =>
      jsonResponse({
        models: [
          { name: "models/gemini-pro", displayName: "Gemini Pro" },
          { name: "models/gemini-1.5-flash", displayName: "Gemini 1.5 Flash" },
          { name: "models/text-bison-001", displayName: "Text Bison" },
        ],
      }),
    );

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "google",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      ok: boolean;
      models: { id: string; name: string }[];
    };
    expect(result.ok).toBe(true);
    // Should only include gemini models
    expect(result.models).toHaveLength(2);
    expect(result.models[0].id).toBe("gemini-pro");
    expect(result.models[0].name).toBe("Gemini Pro");
  });

  it("returns Perplexity static model list", async () => {
    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "perplexity",
      credentials: { apiKey: "pplx-key" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      ok: boolean;
      models: { id: string }[];
    };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(5);
    expect(result.models.map((m) => m.id)).toContain("sonar-pro");
    expect(result.models.map((m) => m.id)).toContain("sonar-deep-research");
  });

  it("returns Ollama local models", async () => {
    mockFetch(async () =>
      jsonResponse({ models: [{ name: "llama2:latest" }, { name: "codellama:7b" }] }),
    );

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "ollama",
      credentials: { baseUrl: "http://localhost:11434" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      ok: boolean;
      models: { id: string }[];
    };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(2);
    expect(result.models[0].id).toBe("llama2:latest");
  });

  it("returns empty models on API failure", async () => {
    mockFetch(async () => jsonResponse({}, 500));

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "anthropic",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as { ok: boolean; models: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(0);
  });

  it("returns empty array for unknown provider", async () => {
    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "unknown-provider",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as { ok: boolean; models: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(0);
  });

  it("handles timeout error on model fetch", async () => {
    mockFetch(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "openai",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: false, error: "Service not reachable (timeout)", models: [] },
      undefined,
    );
  });

  it("handles network error on model fetch", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "groq",
      credentials: { apiKey: "key" },
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { ok: false, error: "Service not reachable", models: [] },
      undefined,
    );
  });

  it("returns DeepSeek models", async () => {
    mockFetch(async () =>
      jsonResponse({ data: [{ id: "deepseek-chat" }, { id: "deepseek-coder" }] }),
    );

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "deepseek",
      credentials: { apiKey: "ds-key" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      ok: boolean;
      models: { id: string }[];
    };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(2);
    expect(result.models[0].id).toBe("deepseek-chat");
  });

  it("returns custom provider models", async () => {
    mockFetch(async () => jsonResponse({ data: [{ id: "my-model" }] }));

    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "custom",
      credentials: { baseUrl: "http://my-llm:8080", apiKey: "key" },
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      ok: boolean;
      models: { id: string }[];
    };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(1);
    expect(result.models[0].id).toBe("my-model");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://my-llm:8080/v1/models",
      expect.anything(),
    );
  });

  it("returns empty for custom provider without baseUrl", async () => {
    const { opts, respond } = makeOpts("onboarding.models", {
      provider: "custom",
      credentials: {},
    });
    await handler(opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as { ok: boolean; models: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(0);
  });
});
