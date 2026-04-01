/**
 * Integration types for email, calendar, and meeting providers.
 *
 * Each integration connects via OAuth2 (or API key) and exposes
 * capabilities that can be used through the UI, workflows, and Jarvis.
 */

// ── Provider identifiers ─────────────────────────────────────────

export type IntegrationCategory = "email" | "calendar" | "meeting" | (string & {});

export type IntegrationProviderId =
  | "gmail"
  | "outlook_mail"
  | "google_calendar"
  | "outlook_calendar"
  | "zoom"
  | "google_meet"
  | "ms_teams_meetings"
  | (string & {});

// ── OAuth2 tokens ────────────────────────────────────────────────

export type OAuth2TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp ms
  tokenType: string;
  scope: string;
};

// ── Connection state ─────────────────────────────────────────────

export type IntegrationStatus = "connected" | "disconnected" | "expired" | "error";

export type IntegrationConnection = {
  id: string; // e.g. "gmail-abc123"
  providerId: IntegrationProviderId;
  category: IntegrationCategory;
  status: IntegrationStatus;
  label: string; // User-facing label, e.g. "user@gmail.com"
  accountEmail?: string;
  connectedAt: string;
  lastUsedAt?: string;
  error?: string;
  scopes?: string[];
};

/**
 * Full connection including encrypted token data.
 * Only used server-side; the UI never sees raw tokens.
 */
export type IntegrationConnectionFull = IntegrationConnection & {
  tokens: OAuth2TokenSet;
  config?: Record<string, unknown>;
};

// ── Provider definitions ─────────────────────────────────────────

export type OAuth2ProviderConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
};

export type IntegrationProviderDefinition = {
  id: IntegrationProviderId;
  name: string;
  category: IntegrationCategory;
  icon: string; // filename in /icons/integrations/
  description: string;
  authType: "oauth2" | "api_key" | "bearer_token" | "basic_auth" | "none";
  oauth2Config?: OAuth2ProviderConfig;
  capabilities: string[];
};

// ── Provider registry ────────────────────────────────────────────

export const INTEGRATION_PROVIDERS: IntegrationProviderDefinition[] = [
  {
    id: "gmail",
    name: "Gmail",
    category: "email",
    icon: "gmail",
    description: "Read, send, search, and organize email via Gmail API",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientIdEnvVar: "GOOGLE_CLIENT_ID",
      clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
    },
    capabilities: ["read", "send", "draft", "search", "organize"],
  },
  {
    id: "outlook_mail",
    name: "Outlook",
    category: "email",
    icon: "outlook",
    description: "Read, send, search, and organize email via Microsoft Graph",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["Mail.Read", "Mail.Send", "Mail.ReadWrite", "User.Read", "offline_access"],
      clientIdEnvVar: "MICROSOFT_CLIENT_ID",
      clientSecretEnvVar: "MICROSOFT_CLIENT_SECRET",
    },
    capabilities: ["read", "send", "draft", "search", "organize"],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "calendar",
    icon: "google-calendar",
    description: "Create, update, and manage calendar events via Google Calendar API",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientIdEnvVar: "GOOGLE_CLIENT_ID",
      clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
    },
    capabilities: [
      "list_events",
      "create_event",
      "update_event",
      "delete_event",
      "availability",
      "rsvp",
    ],
  },
  {
    id: "outlook_calendar",
    name: "Outlook Calendar",
    category: "calendar",
    icon: "outlook",
    description: "Create, update, and manage calendar events via Microsoft Graph",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["Calendars.ReadWrite", "User.Read", "offline_access"],
      clientIdEnvVar: "MICROSOFT_CLIENT_ID",
      clientSecretEnvVar: "MICROSOFT_CLIENT_SECRET",
    },
    capabilities: [
      "list_events",
      "create_event",
      "update_event",
      "delete_event",
      "availability",
      "rsvp",
    ],
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "meeting",
    icon: "zoom",
    description: "Schedule meetings and retrieve join links via Zoom API",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      scopes: ["meeting:write", "meeting:read", "user:read"],
      clientIdEnvVar: "ZOOM_CLIENT_ID",
      clientSecretEnvVar: "ZOOM_CLIENT_SECRET",
    },
    capabilities: ["schedule", "list", "get_details", "get_join_link"],
  },
  {
    id: "google_meet",
    name: "Google Meet",
    category: "meeting",
    icon: "google-meet",
    description: "Schedule meetings with Google Meet links via Calendar API",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientIdEnvVar: "GOOGLE_CLIENT_ID",
      clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
    },
    capabilities: ["schedule", "list", "get_join_link"],
  },
  {
    id: "ms_teams_meetings",
    name: "Microsoft Teams",
    category: "meeting",
    icon: "ms-teams",
    description: "Schedule Teams meetings and retrieve join links via Microsoft Graph",
    authType: "oauth2",
    oauth2Config: {
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["OnlineMeetings.ReadWrite", "User.Read", "offline_access"],
      clientIdEnvVar: "MICROSOFT_CLIENT_ID",
      clientSecretEnvVar: "MICROSOFT_CLIENT_SECRET",
    },
    capabilities: ["schedule", "list", "get_details", "get_join_link"],
  },
];

/**
 * Look up a provider definition by ID.
 */
export function getProviderDefinition(
  id: IntegrationProviderId,
): IntegrationProviderDefinition | undefined {
  return INTEGRATION_PROVIDERS.find((p) => p.id === id);
}
