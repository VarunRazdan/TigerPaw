/**
 * Calendar API clients — Google Calendar and Outlook Calendar (Microsoft Graph).
 *
 * Both implement the CalendarClient interface.
 */

import type {
  CalendarClient,
  CalendarEvent,
  CreateEventParams,
  UpdateEventParams,
} from "./types.js";
import { IntegrationApiError } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────

async function checkedFetch(provider: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IntegrationApiError(provider, res.status, text.slice(0, 300));
  }
  return res;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ── Google Calendar ──────────────────────────────────────────────

const GCAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";

type GCalEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string }[];
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
};

function parseGCalEvent(ev: GCalEvent): CalendarEvent {
  const meetingLink =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;

  return {
    id: ev.id,
    title: ev.summary ?? "",
    description: ev.description,
    start: ev.start?.dateTime ?? ev.start?.date ?? "",
    end: ev.end?.dateTime ?? ev.end?.date ?? "",
    location: ev.location,
    attendees: ev.attendees?.map((a) => ({
      email: a.email,
      status: a.responseStatus ?? "needsAction",
    })),
    meetingLink,
    allDay: !ev.start?.dateTime,
  };
}

export class GoogleCalendarClient implements CalendarClient {
  constructor(private readonly accessToken: string) {}

  async listEvents(opts?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(opts?.maxResults ?? 25),
      timeMin: opts?.timeMin ?? new Date().toISOString(),
    });
    if (opts?.timeMax) {
      params.set("timeMax", opts.timeMax);
    }

    const res = await checkedFetch("google_calendar", `${GCAL_BASE}/events?${params}`, {
      headers: authHeaders(this.accessToken),
    });
    const data = (await res.json()) as { items?: GCalEvent[] };
    return (data.items ?? []).map(parseGCalEvent);
  }

  async createEvent(params: CreateEventParams): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      summary: params.title,
      start: { dateTime: params.start },
      end: { dateTime: params.end },
    };
    if (params.description) {
      body.description = params.description;
    }
    if (params.location) {
      body.location = params.location;
    }
    if (params.attendees?.length) {
      body.attendees = params.attendees.map((email) => ({ email }));
    }
    if (params.addMeetingLink) {
      body.conferenceData = {
        createRequest: {
          requestId: `tp-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const conferenceParam = params.addMeetingLink ? "&conferenceDataVersion=1" : "";
    const res = await checkedFetch(
      "google_calendar",
      `${GCAL_BASE}/events?sendUpdates=all${conferenceParam}`,
      {
        method: "POST",
        headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return parseGCalEvent((await res.json()) as GCalEvent);
  }

  async updateEvent(id: string, params: UpdateEventParams): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};
    if (params.title !== undefined) {
      body.summary = params.title;
    }
    if (params.description !== undefined) {
      body.description = params.description;
    }
    if (params.location !== undefined) {
      body.location = params.location;
    }
    if (params.start) {
      body.start = { dateTime: params.start };
    }
    if (params.end) {
      body.end = { dateTime: params.end };
    }
    if (params.attendees) {
      body.attendees = params.attendees.map((email) => ({ email }));
    }

    const res = await checkedFetch("google_calendar", `${GCAL_BASE}/events/${id}?sendUpdates=all`, {
      method: "PATCH",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return parseGCalEvent((await res.json()) as GCalEvent);
  }

  async deleteEvent(id: string): Promise<void> {
    await checkedFetch("google_calendar", `${GCAL_BASE}/events/${id}?sendUpdates=all`, {
      method: "DELETE",
      headers: authHeaders(this.accessToken),
    });
  }
}

// ── Outlook Calendar (Microsoft Graph) ───────────────────────────

const GRAPH_CAL_BASE = "https://graph.microsoft.com/v1.0/me";

type GraphCalEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  attendees?: { emailAddress?: { address?: string }; status?: { response?: string } }[];
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
};

function parseGraphCalEvent(ev: GraphCalEvent): CalendarEvent {
  return {
    id: ev.id,
    title: ev.subject ?? "",
    description: ev.bodyPreview ?? ev.body?.content,
    start: ev.start?.dateTime ?? "",
    end: ev.end?.dateTime ?? "",
    location: ev.location?.displayName,
    attendees: ev.attendees?.map((a) => ({
      email: a.emailAddress?.address ?? "",
      status: a.status?.response ?? "none",
    })),
    meetingLink: ev.onlineMeeting?.joinUrl ?? ev.onlineMeetingUrl,
    allDay: ev.isAllDay,
  };
}

export class OutlookCalendarClient implements CalendarClient {
  constructor(private readonly accessToken: string) {}

  async listEvents(opts?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      $top: String(opts?.maxResults ?? 25),
      $orderby: "start/dateTime",
      $select:
        "id,subject,bodyPreview,location,start,end,isAllDay,attendees,onlineMeeting,onlineMeetingUrl",
    });
    const startFilter = opts?.timeMin ?? new Date().toISOString();
    const filters = [`start/dateTime ge '${startFilter}'`];
    if (opts?.timeMax) {
      filters.push(`end/dateTime le '${opts.timeMax}'`);
    }
    params.set("$filter", filters.join(" and "));

    const res = await checkedFetch("outlook_calendar", `${GRAPH_CAL_BASE}/events?${params}`, {
      headers: authHeaders(this.accessToken),
    });
    const data = (await res.json()) as { value: GraphCalEvent[] };
    return (data.value ?? []).map(parseGraphCalEvent);
  }

  async createEvent(params: CreateEventParams): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      subject: params.title,
      start: { dateTime: params.start, timeZone: "UTC" },
      end: { dateTime: params.end, timeZone: "UTC" },
    };
    if (params.description) {
      body.body = { contentType: "Text", content: params.description };
    }
    if (params.location) {
      body.location = { displayName: params.location };
    }
    if (params.attendees?.length) {
      body.attendees = params.attendees.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      }));
    }
    if (params.addMeetingLink) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    }

    const res = await checkedFetch("outlook_calendar", `${GRAPH_CAL_BASE}/events`, {
      method: "POST",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return parseGraphCalEvent((await res.json()) as GraphCalEvent);
  }

  async updateEvent(id: string, params: UpdateEventParams): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};
    if (params.title !== undefined) {
      body.subject = params.title;
    }
    if (params.description !== undefined) {
      body.body = { contentType: "Text", content: params.description };
    }
    if (params.location !== undefined) {
      body.location = { displayName: params.location };
    }
    if (params.start) {
      body.start = { dateTime: params.start, timeZone: "UTC" };
    }
    if (params.end) {
      body.end = { dateTime: params.end, timeZone: "UTC" };
    }
    if (params.attendees) {
      body.attendees = params.attendees.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      }));
    }

    const res = await checkedFetch("outlook_calendar", `${GRAPH_CAL_BASE}/events/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return parseGraphCalEvent((await res.json()) as GraphCalEvent);
  }

  async deleteEvent(id: string): Promise<void> {
    await checkedFetch("outlook_calendar", `${GRAPH_CAL_BASE}/events/${id}`, {
      method: "DELETE",
      headers: authHeaders(this.accessToken),
    });
  }
}
