/**
 * Tests for the OpenAI integration provider.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAction } from "../../registry.js";
import type { AuthContext } from "../../types.js";

// Mock _utils to intercept fetchWithTimeout
vi.mock("../_utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../_utils.js")>();
  return {
    ...original,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "../_utils.js";

const mockFetch = vi.mocked(fetchWithTimeout);

function stubAuth(token = "sk-test-openai-key"): AuthContext {
  return {
    getAccessToken: async () => token,
    getCredentialField: () => undefined,
    credentials: {},
  };
}

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

// Load once — module caching means re-import is a no-op
import "../openai.js";

describe("OpenAI Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── chat_completion ─────────────────────────────────────────────

  describe("openai.chat_completion", () => {
    it("sends POST to correct endpoint with Bearer auth and messages body", async () => {
      const responseBody = {
        choices: [
          {
            message: { content: "Hello! How can I help?" },
            finish_reason: "stop",
          },
        ],
        model: "gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };
      mockFetch.mockResolvedValue(makeResponse(responseBody));

      const action = getAction("openai", "openai.chat_completion")!;
      const result = await action.execute(
        { prompt: "Hello!", model: "gpt-4o-mini", temperature: 0.5, max_tokens: 512 },
        stubAuth(),
      );

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-openai-key",
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify request body
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.model).toBe("gpt-4o-mini");
      expect(requestBody.messages).toEqual([{ role: "user", content: "Hello!" }]);
      expect(requestBody.temperature).toBe(0.5);
      expect(requestBody.max_tokens).toBe(512);

      // Verify response mapping
      expect(result.content).toBe("Hello! How can I help?");
      expect(result.model).toBe("gpt-4o-mini");
      expect(result.finish_reason).toBe("stop");
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      });
    });

    it("includes system message when system prompt is provided", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          choices: [{ message: { content: "I am a pirate." }, finish_reason: "stop" }],
          model: "gpt-4o",
          usage: {},
        }),
      );

      const action = getAction("openai", "openai.chat_completion")!;
      await action.execute(
        {
          prompt: "Tell me about yourself",
          system: "You are a pirate.",
          model: "gpt-4o",
        },
        stubAuth(),
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.messages).toEqual([
        { role: "system", content: "You are a pirate." },
        { role: "user", content: "Tell me about yourself" },
      ]);
    });

    it("omits system message when no system prompt is provided", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          choices: [{ message: { content: "response" }, finish_reason: "stop" }],
          model: "gpt-4o-mini",
          usage: {},
        }),
      );

      const action = getAction("openai", "openai.chat_completion")!;
      await action.execute({ prompt: "Just a user message" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.messages).toHaveLength(1);
      expect(requestBody.messages[0].role).toBe("user");
    });

    it("clamps max_tokens to 16384", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "length" }],
          model: "gpt-4o",
          usage: {},
        }),
      );

      const action = getAction("openai", "openai.chat_completion")!;
      await action.execute(
        { prompt: "Generate a very long response", max_tokens: 100000 },
        stubAuth(),
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.max_tokens).toBe(16384);
    });

    it("uses default max_tokens of 1024 when not specified", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          model: "gpt-4o-mini",
          usage: {},
        }),
      );

      const action = getAction("openai", "openai.chat_completion")!;
      await action.execute({ prompt: "Hello" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.max_tokens).toBe(1024);
    });

    it("uses default model when not specified", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          model: "gpt-4o-mini",
          usage: {},
        }),
      );

      const action = getAction("openai", "openai.chat_completion")!;
      await action.execute({ prompt: "Hello" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.model).toBe("gpt-4o-mini");
    });
  });

  // ── API error handling ──────────────────────────────────────────

  describe("API error handling", () => {
    it("throws descriptive error on API failure for chat_completion", async () => {
      mockFetch.mockResolvedValue(makeResponse({ error: { message: "Rate limit exceeded" } }, 429));

      const action = getAction("openai", "openai.chat_completion")!;

      await expect(action.execute({ prompt: "Hello" }, stubAuth())).rejects.toThrow(
        /openai\.chat_completion.*OpenAI API error.*429/i,
      );
    });

    it("wraps network errors with action context", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const action = getAction("openai", "openai.chat_completion")!;

      await expect(action.execute({ prompt: "Hello" }, stubAuth())).rejects.toThrow(
        /openai\.chat_completion.*Connection refused/,
      );
    });
  });

  // ── embeddings ──────────────────────────────────────────────────

  describe("openai.embeddings", () => {
    it("sends POST to correct endpoint with the right model", async () => {
      const responseBody = {
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 5, total_tokens: 5 },
      };
      mockFetch.mockResolvedValue(makeResponse(responseBody));

      const action = getAction("openai", "openai.embeddings")!;
      const result = await action.execute(
        { input: "Hello world", model: "text-embedding-3-small" },
        stubAuth(),
      );

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-openai-key",
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify request body
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.input).toBe("Hello world");
      expect(requestBody.model).toBe("text-embedding-3-small");

      // Verify response mapping
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
      expect(result.model).toBe("text-embedding-3-small");
      expect(result.usage).toEqual({ prompt_tokens: 5, total_tokens: 5 });
    });

    it("uses default embedding model when not specified", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          data: [{ embedding: [0.5] }],
          model: "text-embedding-3-small",
          usage: {},
        }),
      );

      const action = getAction("openai", "openai.embeddings")!;
      await action.execute({ input: "test" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.model).toBe("text-embedding-3-small");
    });

    it("throws descriptive error on API failure for embeddings", async () => {
      mockFetch.mockResolvedValue(makeResponse({ error: { message: "Invalid input" } }, 400));

      const action = getAction("openai", "openai.embeddings")!;

      await expect(action.execute({ input: "" }, stubAuth())).rejects.toThrow(
        /openai\.embeddings.*OpenAI API error.*400/i,
      );
    });
  });
});
