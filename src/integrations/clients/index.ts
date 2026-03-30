/**
 * Integration client factory — returns the right API client for a connected provider.
 *
 * Usage:
 *   const client = await getEmailClient();       // auto-detect connected email provider
 *   const msgs = await client.listMessages();
 *
 * All factories use IntegrationService to get fresh access tokens.
 */

import { getIntegrationService } from "../index.js";
import type { IntegrationProviderId } from "../types.js";
import { GoogleCalendarClient, OutlookCalendarClient } from "./calendar-client.js";
import { GmailClient, OutlookMailClient } from "./email-client.js";
import { ZoomClient, GoogleMeetClient, TeamsClient } from "./meeting-client.js";
import type { EmailClient, CalendarClient, MeetingClient } from "./types.js";

export type { EmailClient, CalendarClient, MeetingClient } from "./types.js";
export type {
  EmailMessage,
  CalendarEvent,
  Meeting,
  SendEmailParams,
  CreateEventParams,
  UpdateEventParams,
  CreateMeetingParams,
  IntegrationApiError,
} from "./types.js";

const EMAIL_PROVIDERS: IntegrationProviderId[] = ["gmail", "outlook_mail"];
const CALENDAR_PROVIDERS: IntegrationProviderId[] = ["google_calendar", "outlook_calendar"];
const MEETING_PROVIDERS: IntegrationProviderId[] = ["zoom", "google_meet", "ms_teams_meetings"];

/**
 * Find the first connected provider in a category and get a fresh access token.
 */
async function resolveToken(
  candidates: IntegrationProviderId[],
  preferredProvider?: IntegrationProviderId,
): Promise<{ providerId: IntegrationProviderId; accessToken: string } | { error: string }> {
  const service = getIntegrationService();

  // Check preferred provider first
  if (preferredProvider && candidates.includes(preferredProvider)) {
    const token = await service.getAccessTokenByProvider(preferredProvider);
    if (typeof token === "string") {
      return { providerId: preferredProvider, accessToken: token };
    }
  }

  // Fall back to first connected provider in the category
  for (const pid of candidates) {
    const token = await service.getAccessTokenByProvider(pid);
    if (typeof token === "string") {
      return { providerId: pid, accessToken: token };
    }
  }

  return {
    error: `No connected ${candidates[0]?.replace(/_/g, " ") ?? "integration"} provider found`,
  };
}

/**
 * Get an EmailClient for the first connected email provider.
 */
export async function getEmailClient(
  preferredProvider?: IntegrationProviderId,
): Promise<EmailClient> {
  const result = await resolveToken(EMAIL_PROVIDERS, preferredProvider);
  if ("error" in result) {
    throw new Error(result.error);
  }

  switch (result.providerId) {
    case "gmail":
      return new GmailClient(result.accessToken);
    case "outlook_mail":
      return new OutlookMailClient(result.accessToken);
    default:
      throw new Error(`Unknown email provider: ${result.providerId}`);
  }
}

/**
 * Get a CalendarClient for the first connected calendar provider.
 */
export async function getCalendarClient(
  preferredProvider?: IntegrationProviderId,
): Promise<CalendarClient> {
  const result = await resolveToken(CALENDAR_PROVIDERS, preferredProvider);
  if ("error" in result) {
    throw new Error(result.error);
  }

  switch (result.providerId) {
    case "google_calendar":
      return new GoogleCalendarClient(result.accessToken);
    case "outlook_calendar":
      return new OutlookCalendarClient(result.accessToken);
    default:
      throw new Error(`Unknown calendar provider: ${result.providerId}`);
  }
}

/**
 * Get a MeetingClient for the first connected meeting provider.
 */
export async function getMeetingClient(
  preferredProvider?: IntegrationProviderId,
): Promise<MeetingClient> {
  const result = await resolveToken(MEETING_PROVIDERS, preferredProvider);
  if ("error" in result) {
    throw new Error(result.error);
  }

  switch (result.providerId) {
    case "zoom":
      return new ZoomClient(result.accessToken);
    case "google_meet":
      return new GoogleMeetClient(result.accessToken);
    case "ms_teams_meetings":
      return new TeamsClient(result.accessToken);
    default:
      throw new Error(`Unknown meeting provider: ${result.providerId}`);
  }
}
