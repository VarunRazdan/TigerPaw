/**
 * Tests for the messages gateway RPC handlers.
 *
 * Mocks node:fs and node:os to validate transcript parsing,
 * sorting, limiting, and malformed-line handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Hoisted mocks ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  homedir: vi.fn().mockReturnValue("/home/test"),
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  readdirSync: mocks.readdirSync,
  readFileSync: mocks.readFileSync,
}));

vi.mock("node:os", () => ({
  homedir: mocks.homedir,
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

function jsonl(...entries: unknown[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.homedir.mockReturnValue("/home/test");
  // Default: sessions dir does not exist
  mocks.existsSync.mockReturnValue(false);
});

// ── Import handlers (after mocks are registered) ─────────────────

const { messagesHandlers } = await import("../messages.js");

// ── messages.recent ──────────────────────────────────────────────

describe("messages.recent", () => {
  const handler = messagesHandlers["messages.recent"];

  it("returns empty when sessions dir does not exist", async () => {
    mocks.existsSync.mockReturnValue(false);
    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { messages: [] }, undefined);
  });

  it("returns empty when sessions dir has no subdirectories", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([]);
    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { messages: [] }, undefined);
  });

  it("parses flat format transcript entries", async () => {
    // existsSync: first call for sessions dir, second for transcript.jsonl
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "web-001", isDirectory: () => true }]);
    mocks.readFileSync.mockReturnValue(
      jsonl({
        type: "message",
        role: "user",
        text: "Hello world",
        timestamp: "2026-03-01T10:00:00Z",
      }),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string; author: string }>;
    };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].text).toBe("Hello world");
    expect(payload.messages[0].author).toBe("User");
  });

  it("parses nested format transcript entries", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "cli-002", isDirectory: () => true }]);
    mocks.readFileSync.mockReturnValue(
      jsonl({
        type: "message",
        message: { role: "user", content: "Nested content" },
        timestamp: "2026-03-01T11:00:00Z",
      }),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string }>;
    };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].text).toBe("Nested content");
  });

  it("parses array content blocks in nested format", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "api-003", isDirectory: () => true }]);
    mocks.readFileSync.mockReturnValue(
      jsonl({
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Part one" },
            { type: "image", url: "img.png" },
            { type: "text", text: "Part two" },
          ],
        },
        timestamp: "2026-03-01T12:00:00Z",
      }),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string }>;
    };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].text).toBe("Part one\nPart two");
  });

  it("truncates text to 500 characters", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "cli-004", isDirectory: () => true }]);
    const longText = "A".repeat(1000);
    mocks.readFileSync.mockReturnValue(
      jsonl({
        type: "message",
        role: "user",
        text: longText,
        timestamp: "2026-03-01T13:00:00Z",
      }),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string }>;
    };
    expect(payload.messages[0].text).toHaveLength(500);
  });

  it("sorts messages by timestamp descending", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "s1", isDirectory: () => true }]);
    mocks.readFileSync.mockReturnValue(
      jsonl(
        { type: "message", role: "user", text: "Old", timestamp: "2026-01-01T00:00:00Z" },
        { type: "message", role: "user", text: "New", timestamp: "2026-03-01T00:00:00Z" },
        { type: "message", role: "user", text: "Mid", timestamp: "2026-02-01T00:00:00Z" },
      ),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string }>;
    };
    expect(payload.messages.map((m) => m.text)).toEqual(["New", "Mid", "Old"]);
  });

  it("respects the limit parameter", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "s1", isDirectory: () => true }]);
    const entries = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({
        type: "message",
        role: "user",
        text: `msg-${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    ).join("\n");
    mocks.readFileSync.mockReturnValue(entries);

    const { opts, respond } = makeOpts("messages.recent", { limit: 3 });
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: unknown[];
    };
    expect(payload.messages).toHaveLength(3);
  });

  it("caps limit at 200 via Math.min", async () => {
    mocks.existsSync.mockReturnValue(true);
    // Spread messages across multiple session dirs so the 50-line-per-session
    // window doesn't cap us first. 5 sessions x 50 lines = 250 user messages.
    const sessionDirs = Array.from({ length: 5 }, (_, s) => ({
      name: `sess-${s}`,
      isDirectory: () => true,
    }));
    mocks.readdirSync.mockReturnValue(sessionDirs);

    // Each session produces 50 user messages
    mocks.readFileSync.mockImplementation(() =>
      Array.from({ length: 50 }, (_, i) =>
        JSON.stringify({
          type: "message",
          role: "user",
          text: `msg-${i}`,
          timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        }),
      ).join("\n"),
    );

    const { opts, respond } = makeOpts("messages.recent", { limit: 999 });
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: unknown[];
    };
    // Math.min(999, 200) = 200; total available = 250, so should return exactly 200
    expect(payload.messages).toHaveLength(200);
  });

  it("skips malformed JSON lines", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "s1", isDirectory: () => true }]);
    const content = [
      "not valid json",
      JSON.stringify({
        type: "message",
        role: "user",
        text: "Valid",
        timestamp: "2026-03-01T00:00:00Z",
      }),
      "{broken",
    ].join("\n");
    mocks.readFileSync.mockReturnValue(content);

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string }>;
    };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].text).toBe("Valid");
  });

  it("skips sessions with missing transcript file", async () => {
    // existsSync: sessions dir exists, but transcript does not
    mocks.existsSync
      .mockReturnValueOnce(true) // sessions dir
      .mockReturnValueOnce(false); // transcript.jsonl
    mocks.readdirSync.mockReturnValue([{ name: "s1", isDirectory: () => true }]);

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, { messages: [] }, undefined);
    expect(mocks.readFileSync).not.toHaveBeenCalled();
  });

  it("defaults limit to 50 when not provided", async () => {
    mocks.existsSync.mockReturnValue(true);
    // Two sessions x 50 lines = 100 messages available, but default limit = 50
    mocks.readdirSync.mockReturnValue([
      { name: "s1", isDirectory: () => true },
      { name: "s2", isDirectory: () => true },
    ]);
    mocks.readFileSync.mockImplementation(() =>
      Array.from({ length: 50 }, (_, i) =>
        JSON.stringify({
          type: "message",
          role: "user",
          text: `msg-${i}`,
          timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        }),
      ).join("\n"),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: unknown[];
    };
    // 100 messages available, default limit = 50, so exactly 50 returned
    expect(payload.messages).toHaveLength(50);
  });

  it("ignores assistant role messages", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([{ name: "s1", isDirectory: () => true }]);
    mocks.readFileSync.mockReturnValue(
      jsonl(
        {
          type: "message",
          role: "assistant",
          text: "I am the bot",
          timestamp: "2026-03-01T00:00:00Z",
        },
        { type: "message", role: "user", text: "I am the user", timestamp: "2026-03-01T00:01:00Z" },
      ),
    );

    const { opts, respond } = makeOpts("messages.recent", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      messages: Array<{ text: string }>;
    };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].text).toBe("I am the user");
  });
});
