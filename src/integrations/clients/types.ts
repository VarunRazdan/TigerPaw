/**
 * Shared types for integration API clients (email, calendar, meetings).
 */

// ── Email ────────────────────────────────────────────────────────

export type EmailMessage = {
  id: string;
  threadId?: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  read: boolean;
  labels?: string[];
};

export type SendEmailParams = {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
};

export type SendEmailResult = {
  id: string;
  threadId?: string;
};

export interface EmailClient {
  listMessages(opts?: {
    query?: string;
    maxResults?: number;
    unreadOnly?: boolean;
  }): Promise<EmailMessage[]>;
  getMessage(id: string): Promise<EmailMessage>;
  sendMessage(params: SendEmailParams): Promise<SendEmailResult>;
  markAsRead(id: string): Promise<void>;
}

// ── Calendar ─────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: { email: string; status: string }[];
  meetingLink?: string;
  allDay?: boolean;
};

export type CreateEventParams = {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  addMeetingLink?: boolean;
};

export type UpdateEventParams = Partial<CreateEventParams>;

export interface CalendarClient {
  listEvents(opts?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }): Promise<CalendarEvent[]>;
  createEvent(params: CreateEventParams): Promise<CalendarEvent>;
  updateEvent(id: string, params: UpdateEventParams): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;
}

// ── Meetings ─────────────────────────────────────────────────────

export type Meeting = {
  id: string;
  topic: string;
  startTime: string;
  duration: number; // minutes
  joinUrl: string;
  provider: string;
};

export type CreateMeetingParams = {
  topic: string;
  startTime: string;
  duration: number; // minutes
  attendees?: string[];
};

export interface MeetingClient {
  listMeetings(): Promise<Meeting[]>;
  createMeeting(params: CreateMeetingParams): Promise<Meeting>;
}

// ── Errors ───────────────────────────────────────────────────────

export class IntegrationApiError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    message: string,
  ) {
    super(`[${provider}] ${status}: ${message}`);
    this.name = "IntegrationApiError";
  }
}
