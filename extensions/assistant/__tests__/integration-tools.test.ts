import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIntegrationTools } from "../integration-tools.js";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../../../src/integrations/clients/index.js", () => ({
  getEmailClient: vi.fn(),
  getCalendarClient: vi.fn(),
  getMeetingClient: vi.fn(),
}));

vi.mock("../config.js", () => ({
  getPersonaName: () => "Jarvis",
}));

import {
  getEmailClient,
  getCalendarClient,
  getMeetingClient,
} from "../../../src/integrations/clients/index.js";

const mockEmailClient = {
  listMessages: vi.fn(),
  getMessage: vi.fn(),
  sendMessage: vi.fn(),
  markAsRead: vi.fn(),
};

const mockCalendarClient = {
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
};

const mockMeetingClient = {
  listMeetings: vi.fn(),
  createMeeting: vi.fn(),
};

// ── Test helper ──────────────────────────────────────────────────

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };

function createMockApi() {
  const tools = new Map<string, ToolDef>();
  return {
    registerTool(def: ToolDef, _opts: unknown) {
      tools.set(def.name, def);
    },
    tools,
  };
}

describe("registerIntegrationTools", () => {
  let api: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.mocked(getEmailClient).mockResolvedValue(mockEmailClient as never);
    vi.mocked(getCalendarClient).mockResolvedValue(mockCalendarClient as never);
    vi.mocked(getMeetingClient).mockResolvedValue(mockMeetingClient as never);
    vi.clearAllMocks();

    api = createMockApi();
    registerIntegrationTools(api as never);
  });

  it("registers all 8 tools", () => {
    expect(api.tools.size).toBe(8);
    const names = [...api.tools.keys()];
    expect(names).toEqual([
      "assistant_read_emails",
      "assistant_read_email",
      "assistant_send_email",
      "assistant_list_calendar_events",
      "assistant_create_calendar_event",
      "assistant_update_calendar_event",
      "assistant_delete_calendar_event",
      "assistant_schedule_meeting",
    ]);
  });

  // ── Email tools ──────────────────────────────────────────────

  it("read_emails lists messages", async () => {
    mockEmailClient.listMessages.mockResolvedValueOnce([
      {
        id: "m1",
        subject: "Hello",
        from: "a@b.com",
        date: "2026-03-01T00:00:00Z",
        read: false,
        snippet: "Hi",
      },
    ]);

    const tool = api.tools.get("assistant_read_emails")!;
    const result = await tool.execute("test", { maxResults: 5, unreadOnly: true });

    expect(mockEmailClient.listMessages).toHaveBeenCalledWith({
      query: undefined,
      maxResults: 5,
      unreadOnly: true,
    });
    expect(result).toHaveProperty("details");
  });

  it("read_emails returns empty message when no emails", async () => {
    mockEmailClient.listMessages.mockResolvedValueOnce([]);

    const tool = api.tools.get("assistant_read_emails")!;
    const result = (await tool.execute("test", { unreadOnly: true })) as {
      content: { text: string }[];
    };

    expect(result.content[0].text).toBe("No unread emails.");
  });

  it("read_email gets a single message", async () => {
    mockEmailClient.getMessage.mockResolvedValueOnce({
      id: "m1",
      subject: "Test",
      from: "a@b.com",
      to: ["b@c.com"],
      date: "2026-03-01T00:00:00Z",
      read: true,
      body: "Full body text",
    });

    const tool = api.tools.get("assistant_read_email")!;
    const result = (await tool.execute("test", { emailId: "m1" })) as {
      content: { text: string }[];
    };

    expect(result.content[0].text).toContain("Subject: Test");
    expect(result.content[0].text).toContain("Full body text");
  });

  it("read_email rejects missing emailId", async () => {
    const tool = api.tools.get("assistant_read_email")!;
    const result = (await tool.execute("test", {})) as { content: { text: string }[] };

    expect(result.content[0].text).toBe("Email ID is required.");
  });

  it("send_email sends and returns confirmation", async () => {
    mockEmailClient.sendMessage.mockResolvedValueOnce({ id: "sent1", threadId: "t1" });

    const tool = api.tools.get("assistant_send_email")!;
    const result = (await tool.execute("test", {
      to: ["user@example.com"],
      subject: "Hi",
      body: "Hello there",
    })) as { content: { text: string }[] };

    expect(mockEmailClient.sendMessage).toHaveBeenCalledWith({
      to: ["user@example.com"],
      subject: "Hi",
      body: "Hello there",
      cc: undefined,
      bcc: undefined,
    });
    expect(result.content[0].text).toContain("sent email");
  });

  it("send_email rejects empty recipients", async () => {
    const tool = api.tools.get("assistant_send_email")!;
    const result = (await tool.execute("test", { to: [], subject: "X", body: "Y" })) as {
      content: { text: string }[];
    };

    expect(result.content[0].text).toBe("At least one recipient is required.");
    expect(mockEmailClient.sendMessage).not.toHaveBeenCalled();
  });

  // ── Calendar tools ───────────────────────────────────────────

  it("list_calendar_events returns events", async () => {
    mockCalendarClient.listEvents.mockResolvedValueOnce([
      { id: "e1", title: "Standup", start: "2026-03-01T10:00:00Z", end: "2026-03-01T10:30:00Z" },
    ]);

    const tool = api.tools.get("assistant_list_calendar_events")!;
    const result = (await tool.execute("test", {})) as { content: { text: string }[] };

    expect(result.content[0].text).toContain("Standup");
  });

  it("create_calendar_event creates and returns event", async () => {
    mockCalendarClient.createEvent.mockResolvedValueOnce({
      id: "e2",
      title: "Design Review",
      start: "2026-03-01T14:00:00Z",
      end: "2026-03-01T15:00:00Z",
    });

    const tool = api.tools.get("assistant_create_calendar_event")!;
    const result = (await tool.execute("test", {
      title: "Design Review",
      start: "2026-03-01T14:00:00Z",
      end: "2026-03-01T15:00:00Z",
    })) as { content: { text: string }[] };

    expect(result.content[0].text).toContain("Design Review");
  });

  it("create_calendar_event rejects missing title", async () => {
    const tool = api.tools.get("assistant_create_calendar_event")!;
    const result = (await tool.execute("test", {
      title: "",
      start: "2026-03-01T14:00:00Z",
      end: "2026-03-01T15:00:00Z",
    })) as { content: { text: string }[] };

    expect(result.content[0].text).toBe("Event title is required.");
  });

  it("update_calendar_event updates event", async () => {
    mockCalendarClient.updateEvent.mockResolvedValueOnce({ id: "e1", title: "Renamed" });

    const tool = api.tools.get("assistant_update_calendar_event")!;
    const result = (await tool.execute("test", { eventId: "e1", title: "Renamed" })) as {
      content: { text: string }[];
    };

    expect(result.content[0].text).toContain("Renamed");
  });

  it("delete_calendar_event deletes event", async () => {
    mockCalendarClient.deleteEvent.mockResolvedValueOnce(undefined);

    const tool = api.tools.get("assistant_delete_calendar_event")!;
    const result = (await tool.execute("test", { eventId: "e1" })) as {
      content: { text: string }[];
    };

    expect(result.content[0].text).toContain("deleted");
  });

  // ── Meeting tool ─────────────────────────────────────────────

  it("schedule_meeting creates meeting with join URL", async () => {
    mockMeetingClient.createMeeting.mockResolvedValueOnce({
      id: "mtg1",
      topic: "Sprint Planning",
      startTime: "2026-03-01T15:00:00Z",
      duration: 60,
      joinUrl: "https://zoom.us/j/123",
      provider: "zoom",
    });

    const tool = api.tools.get("assistant_schedule_meeting")!;
    const result = (await tool.execute("test", {
      topic: "Sprint Planning",
      startTime: "2026-03-01T15:00:00Z",
      duration: 60,
    })) as { content: { text: string }[] };

    expect(result.content[0].text).toContain("Sprint Planning");
    expect(result.content[0].text).toContain("https://zoom.us/j/123");
  });

  it("schedule_meeting rejects missing topic", async () => {
    const tool = api.tools.get("assistant_schedule_meeting")!;
    const result = (await tool.execute("test", {
      topic: "",
      startTime: "2026-03-01T15:00:00Z",
    })) as { content: { text: string }[] };

    expect(result.content[0].text).toBe("Meeting topic is required.");
  });

  // ── Error handling ───────────────────────────────────────────

  it("handles API errors gracefully", async () => {
    mockEmailClient.listMessages.mockRejectedValueOnce(new Error("Token expired"));

    const tool = api.tools.get("assistant_read_emails")!;
    const result = (await tool.execute("test", {})) as { content: { text: string }[] };

    expect(result.content[0].text).toContain("Token expired");
  });
});
