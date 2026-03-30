import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleCalendarClient, OutlookCalendarClient } from "../calendar-client.js";

const mockFetch = vi.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

describe("GoogleCalendarClient", () => {
  let client: GoogleCalendarClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    client = new GoogleCalendarClient("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listEvents returns parsed events", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "ev1",
            summary: "Team Standup",
            start: { dateTime: "2024-03-27T09:00:00Z" },
            end: { dateTime: "2024-03-27T09:30:00Z" },
            attendees: [{ email: "alice@example.com", responseStatus: "accepted" }],
            hangoutLink: "https://meet.google.com/abc-defg-hij",
          },
          {
            id: "ev2",
            summary: "All-Day Event",
            start: { date: "2024-03-27" },
            end: { date: "2024-03-28" },
          },
        ],
      }),
    );

    const events = await client.listEvents();
    expect(events).toHaveLength(2);
    expect(events[0].title).toBe("Team Standup");
    expect(events[0].meetingLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(events[0].allDay).toBe(false);
    expect(events[1].allDay).toBe(true);
  });

  it("createEvent sends proper request body", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "new-ev",
        summary: "Design Review",
        start: { dateTime: "2024-03-28T14:00:00Z" },
        end: { dateTime: "2024-03-28T15:00:00Z" },
      }),
    );

    const event = await client.createEvent({
      title: "Design Review",
      start: "2024-03-28T14:00:00Z",
      end: "2024-03-28T15:00:00Z",
      attendees: ["bob@example.com"],
    });

    expect(event.id).toBe("new-ev");
    expect(event.title).toBe("Design Review");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.summary).toBe("Design Review");
    expect(body.attendees).toEqual([{ email: "bob@example.com" }]);
  });

  it("createEvent with meeting link sets conferenceData", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "ev-meet",
        summary: "Meeting",
        start: { dateTime: "2024-03-28T10:00:00Z" },
        end: { dateTime: "2024-03-28T11:00:00Z" },
        hangoutLink: "https://meet.google.com/xxx",
      }),
    );

    await client.createEvent({
      title: "Meeting",
      start: "2024-03-28T10:00:00Z",
      end: "2024-03-28T11:00:00Z",
      addMeetingLink: true,
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("conferenceDataVersion=1");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.conferenceData).toBeDefined();
  });

  it("updateEvent sends PATCH request", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "ev1",
        summary: "Updated Title",
        start: { dateTime: "2024-03-27T10:00:00Z" },
        end: { dateTime: "2024-03-27T11:00:00Z" },
      }),
    );

    const event = await client.updateEvent("ev1", { title: "Updated Title" });
    expect(event.title).toBe("Updated Title");
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("deleteEvent sends DELETE request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    } as Response);

    await client.deleteEvent("ev1");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    expect(mockFetch.mock.calls[0][0]).toContain("/events/ev1");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Not Found" }, 404));
    await expect(client.listEvents()).rejects.toThrow("[google_calendar] 404");
  });
});

describe("OutlookCalendarClient", () => {
  let client: OutlookCalendarClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    client = new OutlookCalendarClient("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listEvents returns parsed events", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: "ol-ev1",
            subject: "Sprint Planning",
            start: { dateTime: "2024-03-27T14:00:00" },
            end: { dateTime: "2024-03-27T15:00:00" },
            location: { displayName: "Room 42" },
            onlineMeeting: { joinUrl: "https://teams.microsoft.com/meet/xyz" },
            isAllDay: false,
          },
        ],
      }),
    );

    const events = await client.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Sprint Planning");
    expect(events[0].location).toBe("Room 42");
    expect(events[0].meetingLink).toBe("https://teams.microsoft.com/meet/xyz");
  });

  it("createEvent sends proper Graph API body", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "ol-new",
        subject: "1:1 Meeting",
        start: { dateTime: "2024-03-28T10:00:00" },
        end: { dateTime: "2024-03-28T10:30:00" },
      }),
    );

    const event = await client.createEvent({
      title: "1:1 Meeting",
      start: "2024-03-28T10:00:00Z",
      end: "2024-03-28T10:30:00Z",
      description: "Weekly sync",
      addMeetingLink: true,
    });

    expect(event.title).toBe("1:1 Meeting");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.subject).toBe("1:1 Meeting");
    expect(body.isOnlineMeeting).toBe(true);
    expect(body.body.content).toBe("Weekly sync");
  });

  it("deleteEvent sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    } as Response);
    await client.deleteEvent("ol-ev1");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});
