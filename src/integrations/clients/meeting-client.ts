/**
 * Meeting API clients — Zoom, Google Meet, Microsoft Teams.
 *
 * All implement the MeetingClient interface.
 *
 * Google Meet and Teams meetings are created via their respective Calendar
 * APIs with conference/online-meeting data attached.
 */

import type { MeetingClient, Meeting, CreateMeetingParams } from "./types.js";
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

// ── Zoom ─────────────────────────────────────────────────────────

type ZoomMeeting = {
  id: number;
  topic?: string;
  start_time?: string;
  duration?: number;
  join_url?: string;
};

export class ZoomClient implements MeetingClient {
  constructor(private readonly accessToken: string) {}

  async listMeetings(): Promise<Meeting[]> {
    const res = await checkedFetch(
      "zoom",
      "https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=20",
      { headers: authHeaders(this.accessToken) },
    );
    const data = (await res.json()) as { meetings?: ZoomMeeting[] };
    return (data.meetings ?? []).map((m) => ({
      id: String(m.id),
      topic: m.topic ?? "",
      startTime: m.start_time ?? "",
      duration: m.duration ?? 0,
      joinUrl: m.join_url ?? "",
      provider: "zoom",
    }));
  }

  async createMeeting(params: CreateMeetingParams): Promise<Meeting> {
    const body = {
      topic: params.topic,
      type: 2, // scheduled
      start_time: params.startTime,
      duration: params.duration,
      settings: {
        join_before_host: true,
        waiting_room: false,
      },
    };

    const res = await checkedFetch("zoom", "https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as ZoomMeeting;
    return {
      id: String(data.id),
      topic: data.topic ?? params.topic,
      startTime: data.start_time ?? params.startTime,
      duration: data.duration ?? params.duration,
      joinUrl: data.join_url ?? "",
      provider: "zoom",
    };
  }
}

// ── Google Meet (via Calendar API) ───────────────────────────────

const GCAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";

export class GoogleMeetClient implements MeetingClient {
  constructor(private readonly accessToken: string) {}

  async listMeetings(): Promise<Meeting[]> {
    // List upcoming calendar events that have a Google Meet link
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
      timeMin: new Date().toISOString(),
    });

    const res = await checkedFetch("google_meet", `${GCAL_BASE}/events?${params}`, {
      headers: authHeaders(this.accessToken),
    });
    type GCalItem = {
      id: string;
      summary?: string;
      start?: { dateTime?: string };
      hangoutLink?: string;
      conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
    };
    const data = (await res.json()) as { items?: GCalItem[] };
    return (data.items ?? [])
      .filter((ev) => ev.hangoutLink || ev.conferenceData?.entryPoints?.length)
      .map((ev) => ({
        id: ev.id,
        topic: ev.summary ?? "",
        startTime: ev.start?.dateTime ?? "",
        duration: 60, // Calendar API doesn't return duration directly
        joinUrl:
          ev.hangoutLink ??
          ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
          "",
        provider: "google_meet",
      }));
  }

  async createMeeting(params: CreateMeetingParams): Promise<Meeting> {
    const endTime = new Date(
      new Date(params.startTime).getTime() + params.duration * 60_000,
    ).toISOString();

    const body = {
      summary: params.topic,
      start: { dateTime: params.startTime },
      end: { dateTime: endTime },
      conferenceData: {
        createRequest: {
          requestId: `tp-meet-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      ...(params.attendees?.length
        ? { attendees: params.attendees.map((email) => ({ email })) }
        : {}),
    };

    const res = await checkedFetch(
      "google_meet",
      `${GCAL_BASE}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    type CreatedEvent = {
      id: string;
      summary?: string;
      start?: { dateTime?: string };
      hangoutLink?: string;
      conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
    };
    const data = (await res.json()) as CreatedEvent;
    return {
      id: data.id,
      topic: data.summary ?? params.topic,
      startTime: data.start?.dateTime ?? params.startTime,
      duration: params.duration,
      joinUrl:
        data.hangoutLink ??
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
        "",
      provider: "google_meet",
    };
  }
}

// ── Microsoft Teams (via Graph online meetings) ──────────────────

const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";

type GraphOnlineMeeting = {
  id: string;
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  joinWebUrl?: string;
};

export class TeamsClient implements MeetingClient {
  constructor(private readonly accessToken: string) {}

  async listMeetings(): Promise<Meeting[]> {
    // Graph onlineMeetings list is limited; use calendar events with Teams links
    const params = new URLSearchParams({
      $top: "20",
      $orderby: "start/dateTime",
      $filter: `start/dateTime ge '${new Date().toISOString()}' and isOnlineMeeting eq true`,
      $select: "id,subject,start,end,onlineMeeting",
    });

    const res = await checkedFetch("ms_teams", `${GRAPH_BASE}/events?${params}`, {
      headers: authHeaders(this.accessToken),
    });
    type GraphCalEvent = {
      id: string;
      subject?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      onlineMeeting?: { joinUrl?: string };
    };
    const data = (await res.json()) as { value: GraphCalEvent[] };
    return (data.value ?? [])
      .filter((ev) => ev.onlineMeeting?.joinUrl)
      .map((ev) => {
        const startMs = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : 0;
        const endMs = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : 0;
        return {
          id: ev.id,
          topic: ev.subject ?? "",
          startTime: ev.start?.dateTime ?? "",
          duration: endMs > startMs ? Math.round((endMs - startMs) / 60_000) : 60,
          joinUrl: ev.onlineMeeting?.joinUrl ?? "",
          provider: "ms_teams",
        };
      });
  }

  async createMeeting(params: CreateMeetingParams): Promise<Meeting> {
    const endDateTime = new Date(
      new Date(params.startTime).getTime() + params.duration * 60_000,
    ).toISOString();

    const body: Record<string, unknown> = {
      subject: params.topic,
      startDateTime: params.startTime,
      endDateTime,
    };
    if (params.attendees?.length) {
      body.participants = {
        attendees: params.attendees.map((email) => ({
          identity: { user: { id: email } },
          upn: email,
        })),
      };
    }

    const res = await checkedFetch("ms_teams", `${GRAPH_BASE}/onlineMeetings`, {
      method: "POST",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as GraphOnlineMeeting;
    return {
      id: data.id,
      topic: data.subject ?? params.topic,
      startTime: data.startDateTime ?? params.startTime,
      duration: params.duration,
      joinUrl: data.joinWebUrl ?? "",
      provider: "ms_teams",
    };
  }
}
