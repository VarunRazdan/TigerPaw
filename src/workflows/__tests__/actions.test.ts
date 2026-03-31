/**
 * Unit tests for workflow action executors.
 *
 * Covers: send_message, call_webhook, run_llm_task, killswitch, trade,
 * send_email, create_calendar_event, schedule_meeting, executeAction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../../integrations/clients/index.js", () => ({
  getEmailClient: vi.fn(),
  getCalendarClient: vi.fn(),
  getMeetingClient: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getEmailClient,
  getCalendarClient,
  getMeetingClient,
} from "../../integrations/clients/index.js";
import { executeAction, supportedActions } from "../actions.js";
import { ExecutionContext } from "../context.js";
import type { ActionDependencies } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────

function mockDeps(overrides?: Partial<ActionDependencies>): ActionDependencies {
  return {
    gatewayRpc: vi.fn().mockResolvedValue({ ok: true, payload: {} }),
    killSwitch: {
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue({ active: false }),
    },
    log: vi.fn(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Action executors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  // ── send_message ──────────────────────────────────────────────────

  describe("send_message", () => {
    it("resolves templates in the message", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext({ symbol: "AAPL", price: 150 });
      await executeAction("send_message", { message: "Buy {{symbol}} at {{price}}" }, ctx, deps);
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({ message: "Buy AAPL at 150" }),
      );
    });

    it("throws when message template resolves to empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(executeAction("send_message", { message: "" }, ctx, deps)).rejects.toThrow(
        "message template is empty",
      );
    });

    it("throws when RPC returns ok=false", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({ ok: false, error: "network down" }),
      });
      const ctx = new ExecutionContext();
      await expect(executeAction("send_message", { message: "hello" }, ctx, deps)).rejects.toThrow(
        "send_message failed",
      );
    });

    it("resolves target via template", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext({ recipient: "user123" });
      await executeAction("send_message", { message: "hi", to: "{{recipient}}" }, ctx, deps);
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({ to: "user123" }),
      );
    });

    it("accepts 'template' config key as alias for 'message'", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext({ name: "Bob" });
      await executeAction("send_message", { template: "Hello {{name}}" }, ctx, deps);
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({ message: "Hello Bob" }),
      );
    });

    it("returns messageSent and channel in result", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({
          ok: true,
          payload: { messageId: "msg-1" },
        }),
      });
      const ctx = new ExecutionContext();
      const result = await executeAction(
        "send_message",
        { message: "test", channel: "slack" },
        ctx,
        deps,
      );
      expect(result.messageSent).toBe(true);
      expect(result.messageId).toBe("msg-1");
      expect(result.channel).toBe("slack");
    });
  });

  // ── call_webhook ──────────────────────────────────────────────────

  describe("call_webhook", () => {
    it("resolves templates in url, body, and headers", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"ok":true}'),
      });
      const deps = mockDeps();
      const ctx = new ExecutionContext({ host: "api.example.com", token: "abc" });
      await executeAction(
        "call_webhook",
        {
          url: "https://{{host}}/notify",
          body: '{"key":"{{token}}"}',
          headers: { Authorization: "Bearer {{token}}" },
        },
        ctx,
        deps,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/notify",
        expect.objectContaining({
          body: '{"key":"abc"}',
          headers: expect.objectContaining({ Authorization: "Bearer abc" }),
        }),
      );
    });

    it("throws when url is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(executeAction("call_webhook", { url: "" }, ctx, deps)).rejects.toThrow(
        "url is required",
      );
    });

    it("parses JSON response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"result":"success"}'),
      });
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      const result = await executeAction("call_webhook", { url: "https://example.com" }, ctx, deps);
      expect(result.webhookResponse).toEqual({ result: "success" });
      expect(result.webhookStatus).toBe(200);
    });

    it("returns text when response is not JSON", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("plain text"),
      });
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      const result = await executeAction("call_webhook", { url: "https://example.com" }, ctx, deps);
      expect(result.webhookResponse).toBe("plain text");
    });

    it("throws on HTTP error status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("error"),
      });
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("call_webhook", { url: "https://example.com" }, ctx, deps),
      ).rejects.toThrow("500");
    });

    it("defaults to POST method", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("ok"),
      });
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction("call_webhook", { url: "https://example.com" }, ctx, deps);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("does not include body for GET requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("ok"),
      });
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction(
        "call_webhook",
        { url: "https://example.com", method: "GET", body: '{"key": "val"}' },
        ctx,
        deps,
      );
      const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
      expect(callArgs.body).toBeUndefined();
    });
  });

  // ── run_llm_task ──────────────────────────────────────────────────

  describe("run_llm_task", () => {
    it("resolves template in prompt", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({
          ok: true,
          payload: { response: "AI response" },
        }),
      });
      const ctx = new ExecutionContext({ topic: "weather" });
      await executeAction("run_llm_task", { prompt: "Tell me about {{topic}}" }, ctx, deps);
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "chat.send",
        expect.objectContaining({ message: "Tell me about weather" }),
      );
    });

    it("throws when prompt is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(executeAction("run_llm_task", { prompt: "" }, ctx, deps)).rejects.toThrow(
        "prompt is required",
      );
    });

    it("returns llmResponse from payload.response", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({
          ok: true,
          payload: { response: "the answer" },
        }),
      });
      const ctx = new ExecutionContext();
      const result = await executeAction("run_llm_task", { prompt: "ask" }, ctx, deps);
      expect(result.llmResponse).toBe("the answer");
    });

    it("falls back to payload.text if payload.response is missing", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({
          ok: true,
          payload: { text: "fallback text" },
        }),
      });
      const ctx = new ExecutionContext();
      const result = await executeAction("run_llm_task", { prompt: "ask" }, ctx, deps);
      expect(result.llmResponse).toBe("fallback text");
    });

    it("returns llmModel from payload or config", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({
          ok: true,
          payload: { response: "ok", model: "gpt-5" },
        }),
      });
      const ctx = new ExecutionContext();
      const result = await executeAction(
        "run_llm_task",
        { prompt: "ask", model: "gpt-4" },
        ctx,
        deps,
      );
      expect(result.llmModel).toBe("gpt-5");
    });

    it("throws when RPC returns ok=false", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({ ok: false, error: "quota exceeded" }),
      });
      const ctx = new ExecutionContext();
      await expect(executeAction("run_llm_task", { prompt: "ask" }, ctx, deps)).rejects.toThrow(
        "run_llm_task failed",
      );
    });
  });

  // ── killswitch ────────────────────────────────────────────────────

  describe("killswitch", () => {
    it("activates kill switch", async () => {
      const deps = mockDeps();
      const result = await executeAction(
        "killswitch",
        { mode: "activate", reason: "drawdown" },
        new ExecutionContext(),
        deps,
      );
      expect(deps.killSwitch.activate).toHaveBeenCalledWith("drawdown", "workflow", "hard");
      expect(result.killSwitchActive).toBe(true);
    });

    it("deactivates kill switch", async () => {
      const deps = mockDeps();
      const result = await executeAction(
        "killswitch",
        { mode: "deactivate" },
        new ExecutionContext(),
        deps,
      );
      expect(deps.killSwitch.deactivate).toHaveBeenCalledWith("workflow");
      expect(result.killSwitchActive).toBe(false);
    });

    it("checks kill switch status", async () => {
      const deps = mockDeps({
        killSwitch: {
          activate: vi.fn(),
          deactivate: vi.fn(),
          check: vi.fn().mockResolvedValue({ active: true, reason: "emergency" }),
        },
      });
      const result = await executeAction(
        "killswitch",
        { mode: "check" },
        new ExecutionContext(),
        deps,
      );
      expect(result.killSwitchActive).toBe(true);
      expect(result.reason).toBe("emergency");
    });

    it("defaults to activate mode", async () => {
      const deps = mockDeps();
      await executeAction("killswitch", {}, new ExecutionContext(), deps);
      expect(deps.killSwitch.activate).toHaveBeenCalled();
    });

    it("uses soft switchMode when specified", async () => {
      const deps = mockDeps();
      await executeAction(
        "killswitch",
        { mode: "activate", switchMode: "soft" },
        new ExecutionContext(),
        deps,
      );
      expect(deps.killSwitch.activate).toHaveBeenCalledWith(expect.any(String), "workflow", "soft");
    });
  });

  // ── trade ─────────────────────────────────────────────────────────

  describe("trade", () => {
    it("throws when required fields are missing", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(executeAction("trade", { symbol: "AAPL" }, ctx, deps)).rejects.toThrow(
        "extensionId, symbol, and quantity",
      );
    });

    it("throws when quantity is zero", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("trade", { extensionId: "ext1", symbol: "AAPL", quantity: 0 }, ctx, deps),
      ).rejects.toThrow("extensionId, symbol, and quantity");
    });

    it("submits trade via gateway RPC", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({
          ok: true,
          payload: { orderId: "o123", outcome: "filled" },
        }),
      });
      const ctx = new ExecutionContext();
      const result = await executeAction(
        "trade",
        { extensionId: "ext1", symbol: "AAPL", quantity: 10 },
        ctx,
        deps,
      );
      expect(result.tradeSubmitted).toBe(true);
      expect(result.orderId).toBe("o123");
      expect(result.outcome).toBe("filled");
    });

    it("throws on trade failure", async () => {
      const deps = mockDeps({
        gatewayRpc: vi.fn().mockResolvedValue({ ok: false, error: "order denied" }),
      });
      const ctx = new ExecutionContext();
      await expect(
        executeAction("trade", { extensionId: "ext1", symbol: "AAPL", quantity: 10 }, ctx, deps),
      ).rejects.toThrow("trade failed: order denied");
    });

    it("sends correct parameters to gateway RPC", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction(
        "trade",
        {
          extensionId: "ext1",
          symbol: "GOOG",
          side: "sell",
          quantity: 5,
          orderType: "limit",
        },
        ctx,
        deps,
      );
      expect(deps.gatewayRpc).toHaveBeenCalledWith("trading.submit", {
        extensionId: "ext1",
        symbol: "GOOG",
        side: "sell",
        quantity: 5,
        orderType: "limit",
        source: "workflow",
      });
    });

    it("resolves templates in extensionId and symbol", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext({ ext: "binance", sym: "BTC" });
      await executeAction(
        "trade",
        { extensionId: "{{ext}}", symbol: "{{sym}}", quantity: 1 },
        ctx,
        deps,
      );
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "trading.submit",
        expect.objectContaining({ extensionId: "binance", symbol: "BTC" }),
      );
    });

    it("defaults to buy side and market orderType", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction("trade", { extensionId: "ext1", symbol: "AAPL", quantity: 1 }, ctx, deps);
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "trading.submit",
        expect.objectContaining({ side: "buy", orderType: "market" }),
      );
    });
  });

  // ── send_email ────────────────────────────────────────────────────

  describe("send_email", () => {
    it("resolves templates in to, subject, and body", async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: "email-1" });
      vi.mocked(getEmailClient).mockResolvedValue({ sendMessage: mockSend } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext({ name: "Alice", topic: "Report" });
      await executeAction(
        "send_email",
        { to: "alice@example.com", subject: "Hi {{name}}", body: "About {{topic}}" },
        ctx,
        deps,
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Hi Alice", body: "About Report" }),
      );
    });

    it("throws when no recipients", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("send_email", { to: "", subject: "s", body: "b" }, ctx, deps),
      ).rejects.toThrow("at least one recipient");
    });

    it("splits comma-separated recipients", async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: "email-2" });
      vi.mocked(getEmailClient).mockResolvedValue({ sendMessage: mockSend } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      const result = await executeAction(
        "send_email",
        { to: "a@x.com, b@x.com", subject: "test", body: "hello" },
        ctx,
        deps,
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ["a@x.com", "b@x.com"] }),
      );
      expect(result.recipients).toEqual(["a@x.com", "b@x.com"]);
    });

    it("throws when subject is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("send_email", { to: "a@x.com", subject: "", body: "b" }, ctx, deps),
      ).rejects.toThrow("subject is required");
    });

    it("throws when body is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("send_email", { to: "a@x.com", subject: "s", body: "" }, ctx, deps),
      ).rejects.toThrow("body is required");
    });

    it("accepts bodyTemplate as alias for body", async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: "email-3" });
      vi.mocked(getEmailClient).mockResolvedValue({ sendMessage: mockSend } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction(
        "send_email",
        { to: "a@x.com", subject: "s", bodyTemplate: "from template" },
        ctx,
        deps,
      );
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ body: "from template" }));
    });
  });

  // ── create_calendar_event ─────────────────────────────────────────

  describe("create_calendar_event", () => {
    it("resolves templates and creates event", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "evt-1",
        title: "Standup",
        meetingLink: "https://meet.google.com/abc",
      });
      vi.mocked(getCalendarClient).mockResolvedValue({ createEvent: mockCreate } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext({ team: "Engineering" });
      const result = await executeAction(
        "create_calendar_event",
        { title: "{{team}} Standup", start: "2026-01-01T10:00:00Z", end: "2026-01-01T10:30:00Z" },
        ctx,
        deps,
      );
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Engineering Standup" }),
      );
      expect(result.eventCreated).toBe(true);
      expect(result.meetingLink).toBe("https://meet.google.com/abc");
    });

    it("throws when title is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction(
          "create_calendar_event",
          { title: "", start: "2026-01-01T10:00:00Z", end: "2026-01-01T10:30:00Z" },
          ctx,
          deps,
        ),
      ).rejects.toThrow("title is required");
    });

    it("throws when start or end is missing", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("create_calendar_event", { title: "Meeting" }, ctx, deps),
      ).rejects.toThrow("start and end are required");
    });

    it("passes addMeetingLink flag", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "evt-2",
        title: "T",
        meetingLink: null,
      });
      vi.mocked(getCalendarClient).mockResolvedValue({ createEvent: mockCreate } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction(
        "create_calendar_event",
        {
          title: "T",
          start: "2026-01-01T10:00:00Z",
          end: "2026-01-01T10:30:00Z",
          addMeetingLink: true,
        },
        ctx,
        deps,
      );
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ addMeetingLink: true }));
    });
  });

  // ── schedule_meeting ──────────────────────────────────────────────

  describe("schedule_meeting", () => {
    it("resolves templates and schedules meeting", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "mtg-1",
        joinUrl: "https://zoom.us/j/123",
        provider: "zoom",
      });
      vi.mocked(getMeetingClient).mockResolvedValue({ createMeeting: mockCreate } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext({ project: "Tigerpaw" });
      const result = await executeAction(
        "schedule_meeting",
        {
          topic: "{{project}} sync",
          startTime: "2026-01-01T14:00:00Z",
          attendees: "a@x.com, b@x.com",
        },
        ctx,
        deps,
      );
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ topic: "Tigerpaw sync" }));
      expect(result.meetingScheduled).toBe(true);
      expect(result.joinUrl).toBe("https://zoom.us/j/123");
    });

    it("throws when topic is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction(
          "schedule_meeting",
          { topic: "", startTime: "2026-01-01T14:00:00Z" },
          ctx,
          deps,
        ),
      ).rejects.toThrow("topic is required");
    });

    it("uses default duration of 30 when not specified", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "mtg-2",
        joinUrl: "https://zoom.us/j/456",
        provider: "zoom",
      });
      vi.mocked(getMeetingClient).mockResolvedValue({ createMeeting: mockCreate } as never);
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await executeAction(
        "schedule_meeting",
        { topic: "Quick sync", startTime: "2026-01-01T14:00:00Z" },
        ctx,
        deps,
      );
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ duration: 30 }));
    });

    it("throws when startTime is empty", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(
        executeAction("schedule_meeting", { topic: "Meeting" }, ctx, deps),
      ).rejects.toThrow("startTime is required");
    });
  });

  // ── executeAction ─────────────────────────────────────────────────

  describe("executeAction", () => {
    it("throws for unknown action subtype", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext();
      await expect(executeAction("totally_unknown_action", {}, ctx, deps)).rejects.toThrow(
        "Unknown action subtype: totally_unknown_action",
      );
    });
  });

  // ── Template injection safety ─────────────────────────────────────

  describe("template injection", () => {
    it("does not re-expand {{}} in resolved values", async () => {
      const deps = mockDeps();
      const ctx = new ExecutionContext({ user: "{{secret}}", secret: "LEAKED" });
      await executeAction("send_message", { message: "Hello {{user}}" }, ctx, deps);
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({ message: "Hello {{secret}}" }),
      );
    });
  });

  // ── supportedActions ──────────────────────────────────────────────

  describe("supportedActions", () => {
    it("returns all 8 action subtypes", () => {
      const names = supportedActions();
      expect(names).toContain("send_message");
      expect(names).toContain("call_webhook");
      expect(names).toContain("run_llm_task");
      expect(names).toContain("killswitch");
      expect(names).toContain("trade");
      expect(names).toContain("send_email");
      expect(names).toContain("create_calendar_event");
      expect(names).toContain("schedule_meeting");
      expect(names).toHaveLength(8);
    });
  });
});
