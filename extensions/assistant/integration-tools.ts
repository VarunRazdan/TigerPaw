/**
 * Jarvis integration tools — email, calendar, and meeting management.
 *
 * These tools connect to real external services (Gmail, Outlook, Google Calendar,
 * Zoom, etc.) through the IntegrationService's OAuth2 token management.
 *
 * 8 tools:
 *   assistant_read_emails            — List recent/unread emails
 *   assistant_read_email             — Get full email by ID
 *   assistant_send_email             — Send an email
 *   assistant_list_calendar_events   — List upcoming events
 *   assistant_create_calendar_event  — Create a calendar event
 *   assistant_update_calendar_event  — Update an existing event
 *   assistant_delete_calendar_event  — Delete a calendar event
 *   assistant_schedule_meeting       — Schedule a video meeting
 */

import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  getEmailClient,
  getCalendarClient,
  getMeetingClient,
} from "../../src/integrations/clients/index.js";
import { getPersonaName } from "./config.js";

function txt(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined as unknown };
}

function txtD(text: string, details: unknown) {
  return { ...txt(text), details };
}

export function registerIntegrationTools(api: OpenClawPluginApi): void {
  const personaName = getPersonaName();

  // ── Tool 1: Read Emails ───────────────────────────────────────

  api.registerTool(
    {
      name: "assistant_read_emails",
      label: "Read Emails",
      description: `${personaName} reads your recent or unread emails from your connected email provider.`,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (optional)" },
          maxResults: {
            type: "number",
            description: "Maximum number of emails to return (default: 10)",
          },
          unreadOnly: {
            type: "boolean",
            description: "Only show unread emails (default: false)",
          },
        },
        required: [],
      },
      async execute(_id: string, params: unknown) {
        const p = params as { query?: string; maxResults?: number; unreadOnly?: boolean };
        try {
          const client = await getEmailClient();
          const messages = await client.listMessages({
            query: p.query,
            maxResults: p.maxResults ?? 10,
            unreadOnly: p.unreadOnly,
          });

          if (messages.length === 0) {
            return txt(p.unreadOnly ? "No unread emails." : "No emails found.");
          }

          const lines = [`${personaName} found ${messages.length} emails:`, ""];
          for (const msg of messages) {
            const readIcon = msg.read ? "" : " [UNREAD]";
            const date = new Date(msg.date).toLocaleString();
            lines.push(`- ${msg.subject}${readIcon}`);
            lines.push(`  From: ${msg.from} | ${date}`);
            if (msg.snippet) lines.push(`  ${msg.snippet.slice(0, 120)}`);
            lines.push(`  ID: ${msg.id}`);
            lines.push("");
          }

          return txtD(lines.join("\n"), { count: messages.length, messages });
        } catch (err) {
          return txt(`Could not read emails: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_read_emails" },
  );

  // ── Tool 2: Read Single Email ─────────────────────────────────

  api.registerTool(
    {
      name: "assistant_read_email",
      label: "Read Email",
      description: `${personaName} reads the full content of a specific email by its ID.`,
      parameters: {
        type: "object",
        properties: {
          emailId: { type: "string", description: "The email ID to read" },
        },
        required: ["emailId"],
      },
      async execute(_id: string, params: unknown) {
        const p = params as { emailId: string };
        if (!p.emailId) return txt("Email ID is required.");

        try {
          const client = await getEmailClient();
          const msg = await client.getMessage(p.emailId);

          const lines = [
            `Subject: ${msg.subject}`,
            `From: ${msg.from}`,
            `To: ${msg.to.join(", ")}`,
            ...(msg.cc?.length ? [`Cc: ${msg.cc.join(", ")}`] : []),
            `Date: ${new Date(msg.date).toLocaleString()}`,
            `Read: ${msg.read ? "Yes" : "No"}`,
            "",
            "--- Body ---",
            msg.body ?? msg.snippet,
          ];

          return txtD(lines.join("\n"), msg);
        } catch (err) {
          return txt(`Could not read email: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_read_email" },
  );

  // ── Tool 3: Send Email ────────────────────────────────────────

  api.registerTool(
    {
      name: "assistant_send_email",
      label: "Send Email",
      description: `${personaName} sends an email on your behalf via your connected email provider.`,
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses",
          },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body (plain text)" },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC recipients (optional)",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "BCC recipients (optional)",
          },
        },
        required: ["to", "subject", "body"],
      },
      async execute(_id: string, params: unknown) {
        const p = params as {
          to: string[];
          subject: string;
          body: string;
          cc?: string[];
          bcc?: string[];
        };
        if (!p.to?.length) return txt("At least one recipient is required.");
        if (!p.subject?.trim()) return txt("Subject is required.");
        if (!p.body?.trim()) return txt("Body is required.");

        try {
          const client = await getEmailClient();
          const result = await client.sendMessage({
            to: p.to,
            subject: p.subject,
            body: p.body,
            cc: p.cc,
            bcc: p.bcc,
          });

          return txtD(`${personaName} sent email "${p.subject}" to ${p.to.join(", ")}`, result);
        } catch (err) {
          return txt(`Could not send email: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_send_email" },
  );

  // ── Tool 4: List Calendar Events ──────────────────────────────

  api.registerTool(
    {
      name: "assistant_list_calendar_events",
      label: "List Calendar Events",
      description: `${personaName} lists your upcoming calendar events.`,
      parameters: {
        type: "object",
        properties: {
          timeMin: {
            type: "string",
            description: "Start of time range (ISO string, default: now)",
          },
          timeMax: {
            type: "string",
            description: "End of time range (ISO string, optional)",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of events (default: 10)",
          },
        },
        required: [],
      },
      async execute(_id: string, params: unknown) {
        const p = params as { timeMin?: string; timeMax?: string; maxResults?: number };
        try {
          const client = await getCalendarClient();
          const events = await client.listEvents({
            timeMin: p.timeMin,
            timeMax: p.timeMax,
            maxResults: p.maxResults ?? 10,
          });

          if (events.length === 0) {
            return txt("No upcoming events found.");
          }

          const lines = [`${personaName} found ${events.length} upcoming events:`, ""];
          for (const ev of events) {
            const start = new Date(ev.start).toLocaleString();
            const end = new Date(ev.end).toLocaleString();
            lines.push(`- ${ev.title}`);
            lines.push(`  ${start} — ${end}`);
            if (ev.location) lines.push(`  Location: ${ev.location}`);
            if (ev.meetingLink) lines.push(`  Meeting: ${ev.meetingLink}`);
            if (ev.attendees?.length) {
              lines.push(`  Attendees: ${ev.attendees.map((a) => a.email).join(", ")}`);
            }
            lines.push(`  ID: ${ev.id}`);
            lines.push("");
          }

          return txtD(lines.join("\n"), { count: events.length, events });
        } catch (err) {
          return txt(`Could not list events: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_list_calendar_events" },
  );

  // ── Tool 5: Create Calendar Event ─────────────────────────────

  api.registerTool(
    {
      name: "assistant_create_calendar_event",
      label: "Create Calendar Event",
      description: `${personaName} creates a new calendar event.`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start: { type: "string", description: "Start time (ISO string)" },
          end: { type: "string", description: "End time (ISO string)" },
          description: { type: "string", description: "Event description (optional)" },
          location: { type: "string", description: "Location (optional)" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Attendee email addresses (optional)",
          },
          addMeetingLink: {
            type: "boolean",
            description: "Attach a video meeting link (default: false)",
          },
        },
        required: ["title", "start", "end"],
      },
      async execute(_id: string, params: unknown) {
        const p = params as {
          title: string;
          start: string;
          end: string;
          description?: string;
          location?: string;
          attendees?: string[];
          addMeetingLink?: boolean;
        };
        if (!p.title?.trim()) return txt("Event title is required.");
        if (!p.start || !p.end) return txt("Start and end times are required.");

        try {
          const client = await getCalendarClient();
          const event = await client.createEvent({
            title: p.title,
            start: p.start,
            end: p.end,
            description: p.description,
            location: p.location,
            attendees: p.attendees,
            addMeetingLink: p.addMeetingLink,
          });

          const meetStr = event.meetingLink ? ` | Meeting: ${event.meetingLink}` : "";
          return txtD(
            `${personaName} created event: "${event.title}" on ${new Date(event.start).toLocaleString()}${meetStr}`,
            event,
          );
        } catch (err) {
          return txt(`Could not create event: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_create_calendar_event" },
  );

  // ── Tool 6: Update Calendar Event ─────────────────────────────

  api.registerTool(
    {
      name: "assistant_update_calendar_event",
      label: "Update Calendar Event",
      description: `${personaName} updates an existing calendar event.`,
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "The event ID to update" },
          title: { type: "string", description: "New title (optional)" },
          start: { type: "string", description: "New start time (optional)" },
          end: { type: "string", description: "New end time (optional)" },
          description: { type: "string", description: "New description (optional)" },
          location: { type: "string", description: "New location (optional)" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Updated attendee list (optional)",
          },
        },
        required: ["eventId"],
      },
      async execute(_id: string, params: unknown) {
        const p = params as {
          eventId: string;
          title?: string;
          start?: string;
          end?: string;
          description?: string;
          location?: string;
          attendees?: string[];
        };
        if (!p.eventId) return txt("Event ID is required.");

        try {
          const client = await getCalendarClient();
          const event = await client.updateEvent(p.eventId, {
            title: p.title,
            start: p.start,
            end: p.end,
            description: p.description,
            location: p.location,
            attendees: p.attendees,
          });

          return txtD(`${personaName} updated event: "${event.title}"`, event);
        } catch (err) {
          return txt(`Could not update event: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_update_calendar_event" },
  );

  // ── Tool 7: Delete Calendar Event ─────────────────────────────

  api.registerTool(
    {
      name: "assistant_delete_calendar_event",
      label: "Delete Calendar Event",
      description: `${personaName} deletes a calendar event by its ID.`,
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "The event ID to delete" },
        },
        required: ["eventId"],
      },
      async execute(_id: string, params: unknown) {
        const p = params as { eventId: string };
        if (!p.eventId) return txt("Event ID is required.");

        try {
          const client = await getCalendarClient();
          await client.deleteEvent(p.eventId);

          return txt(`${personaName} deleted calendar event ${p.eventId}.`);
        } catch (err) {
          return txt(`Could not delete event: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
    { name: "assistant_delete_calendar_event" },
  );

  // ── Tool 8: Schedule Meeting ──────────────────────────────────

  api.registerTool(
    {
      name: "assistant_schedule_meeting",
      label: "Schedule Meeting",
      description: `${personaName} schedules a video meeting (Zoom, Google Meet, or Teams) via your connected meeting provider.`,
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Meeting topic/title" },
          startTime: { type: "string", description: "Start time (ISO string)" },
          duration: { type: "number", description: "Duration in minutes (default: 30)" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Attendee email addresses (optional)",
          },
        },
        required: ["topic", "startTime"],
      },
      async execute(_id: string, params: unknown) {
        const p = params as {
          topic: string;
          startTime: string;
          duration?: number;
          attendees?: string[];
        };
        if (!p.topic?.trim()) return txt("Meeting topic is required.");
        if (!p.startTime) return txt("Start time is required.");

        try {
          const client = await getMeetingClient();
          const meeting = await client.createMeeting({
            topic: p.topic,
            startTime: p.startTime,
            duration: p.duration ?? 30,
            attendees: p.attendees,
          });

          return txtD(
            `${personaName} scheduled meeting: "${meeting.topic}" at ${new Date(meeting.startTime).toLocaleString()}\nJoin: ${meeting.joinUrl}`,
            meeting,
          );
        } catch (err) {
          return txt(
            `Could not schedule meeting: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    },
    { name: "assistant_schedule_meeting" },
  );
}
