import { create } from "zustand";
import { gatewayRpc } from "@/lib/gateway-rpc";

export type IntegrationCategory = "email" | "calendar" | "meeting";

export type IntegrationStatus = "connected" | "disconnected" | "expired" | "error";

export type IntegrationConnection = {
  id: string;
  providerId: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  label: string;
  accountEmail?: string;
  connectedAt: string;
  lastUsedAt?: string;
  error?: string;
};

export type IntegrationProvider = {
  id: string;
  name: string;
  category: IntegrationCategory;
  icon: string;
  description: string;
  authType: "oauth2" | "api_key";
  capabilities: string[];
};

type IntegrationState = {
  providers: IntegrationProvider[];
  connections: IntegrationConnection[];
  demoMode: boolean;
  connectingProvider: string | null;

  setDemoMode: (enabled: boolean) => void;
  fetchProviders: () => Promise<void>;
  fetchConnections: () => Promise<void>;
  startOAuth: (providerId: string) => Promise<{ authUrl: string; state: string } | null>;
  completeOAuth: (state: string, code: string) => Promise<IntegrationConnection | null>;
  disconnect: (connectionId: string) => Promise<boolean>;
  testConnection: (connectionId: string) => Promise<{ ok: boolean; error?: string }>;
  setConnectingProvider: (providerId: string | null) => void;
  getConnectionForProvider: (providerId: string) => IntegrationConnection | undefined;
};

const DEMO_PROVIDERS: IntegrationProvider[] = [
  {
    id: "gmail",
    name: "Gmail",
    category: "email",
    icon: "gmail",
    description: "Read, send, search, and organize email via Gmail API",
    authType: "oauth2",
    capabilities: ["read", "send", "draft", "search", "organize"],
  },
  {
    id: "outlook_mail",
    name: "Outlook",
    category: "email",
    icon: "outlook",
    description: "Read, send, search, and organize email via Microsoft Graph",
    authType: "oauth2",
    capabilities: ["read", "send", "draft", "search", "organize"],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "calendar",
    icon: "google-calendar",
    description: "Create, update, and manage calendar events via Google Calendar API",
    authType: "oauth2",
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
    capabilities: ["schedule", "list", "get_details", "get_join_link"],
  },
  {
    id: "google_meet",
    name: "Google Meet",
    category: "meeting",
    icon: "google-meet",
    description: "Schedule meetings with Google Meet links via Calendar API",
    authType: "oauth2",
    capabilities: ["schedule", "list", "get_join_link"],
  },
  {
    id: "ms_teams_meetings",
    name: "Microsoft Teams",
    category: "meeting",
    icon: "ms-teams",
    description: "Schedule Teams meetings and retrieve join links via Microsoft Graph",
    authType: "oauth2",
    capabilities: ["schedule", "list", "get_details", "get_join_link"],
  },
];

const DEMO_CONNECTIONS: IntegrationConnection[] = [
  {
    id: "demo-gmail",
    providerId: "gmail",
    category: "email",
    status: "connected",
    label: "user@gmail.com",
    accountEmail: "user@gmail.com",
    connectedAt: "2026-03-20T10:00:00Z",
    lastUsedAt: "2026-03-29T08:30:00Z",
  },
  {
    id: "demo-gcal",
    providerId: "google_calendar",
    category: "calendar",
    status: "connected",
    label: "user@gmail.com",
    accountEmail: "user@gmail.com",
    connectedAt: "2026-03-20T10:00:00Z",
    lastUsedAt: "2026-03-29T07:00:00Z",
  },
  {
    id: "demo-zoom",
    providerId: "zoom",
    category: "meeting",
    status: "connected",
    label: "user@company.com",
    accountEmail: "user@company.com",
    connectedAt: "2026-03-22T14:00:00Z",
    lastUsedAt: "2026-03-28T16:45:00Z",
  },
];

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  providers: [],
  connections: [],
  demoMode: false,
  connectingProvider: null,

  setDemoMode: (enabled) =>
    set({
      demoMode: enabled,
      providers: enabled ? DEMO_PROVIDERS : get().providers,
      connections: enabled ? DEMO_CONNECTIONS : [],
    }),

  fetchProviders: async () => {
    try {
      const result = await gatewayRpc<{ providers?: IntegrationProvider[] }>(
        "integrations.providers",
        {},
      );
      if (result.ok && Array.isArray(result.payload?.providers)) {
        set({ providers: result.payload.providers });
      }
    } catch {
      // Gateway offline — keep demo data
    }
  },

  fetchConnections: async () => {
    try {
      const result = await gatewayRpc<{ connections?: IntegrationConnection[] }>(
        "integrations.connections",
        {},
      );
      if (result.ok && Array.isArray(result.payload?.connections)) {
        set({ connections: result.payload.connections, demoMode: false });
      }
    } catch {
      // Gateway offline — keep demo data
    }
  },

  startOAuth: async (providerId) => {
    try {
      set({ connectingProvider: providerId });
      const result = await gatewayRpc<{ authUrl?: string; state?: string }>(
        "integrations.oauth2.start",
        { providerId },
      );
      if (result.ok && result.payload?.authUrl && result.payload?.state) {
        return {
          authUrl: result.payload.authUrl,
          state: result.payload.state,
        };
      }
      set({ connectingProvider: null });
      return null;
    } catch {
      set({ connectingProvider: null });
      return null;
    }
  },

  completeOAuth: async (state, code) => {
    try {
      const result = await gatewayRpc<{ connection?: IntegrationConnection }>(
        "integrations.oauth2.complete",
        { state, code },
      );
      set({ connectingProvider: null });
      if (result.ok && result.payload?.connection) {
        const connection = result.payload.connection;
        set((s) => ({
          connections: [
            ...s.connections.filter((c) => c.providerId !== connection.providerId),
            connection,
          ],
          demoMode: false,
        }));
        return connection;
      }
      return null;
    } catch {
      set({ connectingProvider: null });
      return null;
    }
  },

  disconnect: async (connectionId) => {
    try {
      const result = await gatewayRpc<{ removed?: boolean }>("integrations.disconnect", {
        id: connectionId,
      });
      if (result.ok) {
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== connectionId),
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  testConnection: async (connectionId) => {
    try {
      const result = await gatewayRpc<{ ok?: boolean; error?: string }>("integrations.test", {
        id: connectionId,
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: result.payload?.ok === true, error: result.payload?.error };
    } catch {
      return { ok: false, error: "Gateway unavailable" };
    }
  },

  setConnectingProvider: (providerId) => set({ connectingProvider: providerId }),

  getConnectionForProvider: (providerId) =>
    get().connections.find((c) => c.providerId === providerId),
}));
