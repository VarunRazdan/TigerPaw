/**
 * Tests for the Anthropic integration provider.
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

function stubAuth(token = "sk-ant-test-key"): AuthContext {
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
import "../anthropic.js";

describe("Anthropic Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── chat_completion ─────────────────────────────────────────────

  describe("anthropic.chat_completion", () => {
    it("sends POST to correct endpoint with x-api-key header (NOT Authorization)", async () => {
      const responseBody = {
        content: [{ type: "text", text: "Hello from Claude!" }],
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: "end_turn",
      };
      mockFetch.mockResolvedValue(makeResponse(responseBody));

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      const result = await action.execute(
        { prompt: "Hello!", model: "claude-sonnet-4-6", temperature: 0.5, max_tokens: 512 },
        stubAuth(),
      );

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test-key",
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify x-api-key is used (NOT Authorization/Bearer)
      const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(callHeaders["x-api-key"]).toBe("sk-ant-test-key");
      expect(callHeaders["Authorization"]).toBeUndefined();

      // Verify response mapping
      expect(result.content).toBe("Hello from Claude!");
      expect(result.model).toBe("claude-sonnet-4-6");
      expect(result.stop_reason).toBe("end_turn");
      expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
    });

    it("includes anthropic-version header in every request", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [{ type: "text", text: "ok" }],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      await action.execute({ prompt: "Hello" }, stubAuth());

      const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(callHeaders["anthropic-version"]).toBe("2023-06-01");
    });

    it("clamps max_tokens to 16384", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [{ type: "text", text: "ok" }],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      await action.execute({ prompt: "Generate a long response", max_tokens: 999999 }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.max_tokens).toBe(16384);
    });

    it("uses default max_tokens of 1024 when not specified", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [{ type: "text", text: "ok" }],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      await action.execute({ prompt: "Hello" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.max_tokens).toBe(1024);
    });

    it("passes system prompt at top level (not in messages)", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [{ type: "text", text: "I am a helpful assistant." }],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      await action.execute(
        {
          prompt: "What are you?",
          system: "You are a helpful assistant.",
        },
        stubAuth(),
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      // Anthropic API uses top-level "system" field, not a system message in the messages array
      expect(requestBody.system).toBe("You are a helpful assistant.");
      expect(requestBody.messages).toEqual([{ role: "user", content: "What are you?" }]);
      // Verify system is NOT in the messages array
      const systemMessages = requestBody.messages.filter(
        (m: { role: string }) => m.role === "system",
      );
      expect(systemMessages).toHaveLength(0);
    });

    it("omits system field when no system prompt is provided", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [{ type: "text", text: "ok" }],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      await action.execute({ prompt: "Hello" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.system).toBeUndefined();
    });

    it("uses default model when not specified", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [{ type: "text", text: "ok" }],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      await action.execute({ prompt: "Hello" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.model).toBe("claude-sonnet-4-6");
    });

    it("concatenates multiple text content blocks", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [
            { type: "text", text: "First part. " },
            { type: "text", text: "Second part." },
          ],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      const result = await action.execute({ prompt: "Hello" }, stubAuth());

      expect(result.content).toBe("First part. Second part.");
    });

    it("filters out non-text content blocks", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          content: [
            { type: "text", text: "Hello" },
            { type: "tool_use", id: "tool-1", name: "search", input: {} },
          ],
          model: "claude-sonnet-4-6",
          usage: {},
          stop_reason: "end_turn",
        }),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;
      const result = await action.execute({ prompt: "Hello" }, stubAuth());

      expect(result.content).toBe("Hello");
    });
  });

  // ── API error handling ──────────────────────────────────────────

  describe("API error handling", () => {
    it("throws descriptive error on API failure", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ error: { type: "rate_limit_error", message: "Too many requests" } }, 429),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;

      await expect(action.execute({ prompt: "Hello" }, stubAuth())).rejects.toThrow(
        /anthropic\.chat_completion.*Anthropic API error.*429/i,
      );
    });

    it("wraps network errors with action context", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNRESET"));

      const action = getAction("anthropic", "anthropic.chat_completion")!;

      await expect(action.execute({ prompt: "Hello" }, stubAuth())).rejects.toThrow(
        /anthropic\.chat_completion.*ECONNRESET/,
      );
    });

    it("handles 401 unauthorized errors", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ error: { type: "authentication_error", message: "Invalid API key" } }, 401),
      );

      const action = getAction("anthropic", "anthropic.chat_completion")!;

      await expect(action.execute({ prompt: "Hello" }, stubAuth())).rejects.toThrow(
        /anthropic\.chat_completion.*401/,
      );
    });
  });
});
