import { create } from "zustand";
import { gatewayRpc } from "@/lib/gateway-rpc";

export type MessageHubMessageType = "message" | "approval" | "alert";
export type MessageHubPriority = "high" | "normal" | "low";

export type MessageHubMessage = {
  id: string;
  channel: string;
  channelIcon: string;
  sender: string;
  preview: string;
  timestamp: number;
  read: boolean;
  priority: MessageHubPriority;
  type: MessageHubMessageType;
};

const CHANNEL_ICONS: Record<string, string> = {
  discord: "/icons/messaging-channels/discord.svg",
  telegram: "/icons/messaging-channels/telegram.svg",
  slack: "/icons/messaging-channels/slack.svg",
  signal: "/icons/messaging-channels/signal.svg",
  whatsapp: "/icons/messaging-channels/whatsapp.svg",
};

const PAGE_SIZE = 50;

type RawMessage = {
  id: string;
  channel: string;
  author: string;
  text: string;
  timestamp: string;
  type: string;
  read: boolean;
};

function toHubMessage(m: RawMessage): MessageHubMessage {
  return {
    id: m.id,
    channel: m.channel,
    channelIcon: CHANNEL_ICONS[m.channel] ?? m.channel,
    sender: m.author,
    preview: m.text,
    timestamp: new Date(m.timestamp).getTime(),
    read: m.read,
    priority: m.type === "approval" ? ("high" as const) : ("normal" as const),
    type: m.type as MessageHubMessageType,
  };
}

type MessageHubState = {
  messages: MessageHubMessage[];
  filter: string | null;
  searchQuery: string;
  demoMode: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  cursor: string | null;
  setDemoMode: (enabled: boolean) => void;
  fetchRecentMessages: () => Promise<void>;
  fetchMoreMessages: () => Promise<void>;
  addMessage: (msg: Omit<MessageHubMessage, "id">) => void;
  markRead: (id: string) => void;
  markAllRead: (channel?: string) => void;
  setFilter: (channel: string | null) => void;
  setSearchQuery: (query: string) => void;
  unreadCount: () => number;
  unreadByChannel: () => Record<string, number>;
};

const HOUR = 3_600_000;
const DAY = 86_400_000;

const DEMO_MESSAGES: MessageHubMessage[] = [
  {
    id: "msg-1",
    channel: "discord",
    channelIcon: "/icons/messaging-channels/discord.svg",
    sender: "CryptoMike#4821",
    preview: "Hey, is the NVDA buy still pending? My limit order got filled on Alpaca already",
    timestamp: Date.now() - 12 * 60_000,
    read: false,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-2",
    channel: "telegram",
    channelIcon: "/icons/messaging-channels/telegram.svg",
    sender: "Elena V.",
    preview: "Can you check the Polymarket position? The odds shifted overnight",
    timestamp: Date.now() - 35 * 60_000,
    read: false,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-3",
    channel: "slack",
    channelIcon: "/icons/messaging-channels/slack.svg",
    sender: "#deployments",
    preview: "Production deploy v2.14.3 completed successfully. All health checks passing.",
    timestamp: Date.now() - 1.5 * HOUR,
    read: true,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-4",
    channel: "discord",
    channelIcon: "/icons/messaging-channels/discord.svg",
    sender: "TraderJess",
    preview: "What's your take on the Fed rate cut prediction market? Kalshi has it at 65c",
    timestamp: Date.now() - 2 * HOUR,
    read: false,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-5",
    channel: "signal",
    channelIcon: "/icons/messaging-channels/signal.svg",
    sender: "Dad",
    preview:
      "Are we still on for dinner Saturday? Mom wants to know if you have any allergies to the new restaurant",
    timestamp: Date.now() - 3 * HOUR,
    read: true,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-6",
    channel: "slack",
    channelIcon: "/icons/messaging-channels/slack.svg",
    sender: "#infra-alerts",
    preview: "WARNING: Redis memory usage at 87% on prod-cache-02. Consider scaling.",
    timestamp: Date.now() - 4 * HOUR,
    read: false,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-7",
    channel: "telegram",
    channelIcon: "/icons/messaging-channels/telegram.svg",
    sender: "Marcus Chen",
    preview: "Sent you the research doc on AI prediction markets. LMK what you think",
    timestamp: Date.now() - 6 * HOUR,
    read: false,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-8",
    channel: "whatsapp",
    channelIcon: "/icons/messaging-channels/whatsapp.svg",
    sender: "Sarah K.",
    preview:
      "Just saw your Tigerpaw setup -- looks amazing! Can you walk me through the trading config?",
    timestamp: Date.now() - 8 * HOUR,
    read: false,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-9",
    channel: "discord",
    channelIcon: "/icons/messaging-channels/discord.svg",
    sender: "BotDev#0092",
    preview:
      "The new kill switch integration is live. Tested with paper trading on Alpaca -- works great",
    timestamp: Date.now() - DAY - 2 * HOUR,
    read: true,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-10",
    channel: "slack",
    channelIcon: "/icons/messaging-channels/slack.svg",
    sender: "#trading-ops",
    preview: "NVDA BUY 10 shares @ $134.00 via Alpaca requires manual approval",
    timestamp: Date.now() - DAY - 3 * HOUR,
    read: false,
    priority: "high",
    type: "approval",
  },
  {
    id: "msg-11",
    channel: "telegram",
    channelIcon: "/icons/messaging-channels/telegram.svg",
    sender: "Tigerpaw Alerts",
    preview: "Kill switch triggered: daily loss limit breached (3.2%). All trading halted.",
    timestamp: Date.now() - DAY - 5 * HOUR,
    read: false,
    priority: "high",
    type: "alert",
  },
  {
    id: "msg-12",
    channel: "whatsapp",
    channelIcon: "/icons/messaging-channels/whatsapp.svg",
    sender: "Alex P.",
    preview:
      "Hey, got your message about the Manifold markets. I'll check the GDP contract tonight",
    timestamp: Date.now() - DAY - 7 * HOUR,
    read: true,
    priority: "normal",
    type: "message",
  },
  {
    id: "msg-13",
    channel: "signal",
    channelIcon: "/icons/messaging-channels/signal.svg",
    sender: "Jamie",
    preview: "Running late, be there in 15",
    timestamp: Date.now() - 2 * DAY - 1 * HOUR,
    read: true,
    priority: "low",
    type: "message",
  },
  {
    id: "msg-14",
    channel: "slack",
    channelIcon: "/icons/messaging-channels/slack.svg",
    sender: "#trading-ops",
    preview: "BTC-USD BUY $500.00 via Coinbase awaiting confirmation. Timeout in 5m.",
    timestamp: Date.now() - 2 * DAY - 4 * HOUR,
    read: false,
    priority: "high",
    type: "approval",
  },
];

let nextId = 200;

export const useMessageHubStore = create<MessageHubState>((set, get) => ({
  messages: DEMO_MESSAGES,
  filter: null,
  searchQuery: "",
  demoMode: true,
  hasMore: true,
  loadingMore: false,
  cursor: null,

  setDemoMode: (enabled) =>
    set({
      demoMode: enabled,
      messages: enabled ? DEMO_MESSAGES : [],
      hasMore: true,
      loadingMore: false,
      cursor: null,
    }),

  fetchRecentMessages: async () => {
    try {
      const result = await gatewayRpc<{ messages?: RawMessage[] }>("messages.recent", {
        limit: PAGE_SIZE,
      });
      if (
        result.ok &&
        Array.isArray(result.payload?.messages) &&
        result.payload.messages.length > 0
      ) {
        const liveMessages = result.payload.messages.map(toHubMessage);
        const oldest = liveMessages[liveMessages.length - 1];
        set({
          messages: liveMessages,
          demoMode: false,
          cursor: oldest ? String(oldest.timestamp) : null,
          hasMore: liveMessages.length >= PAGE_SIZE,
        });
      }
    } catch {
      // Gateway offline -- keep demo data
    }
  },

  fetchMoreMessages: async () => {
    const { loadingMore, hasMore, cursor, demoMode } = get();
    if (loadingMore || !hasMore || demoMode) {
      return;
    }

    set({ loadingMore: true });
    try {
      const result = await gatewayRpc<{ messages?: RawMessage[] }>("messages.recent", {
        limit: PAGE_SIZE,
        before: cursor,
      });

      if (result.ok && Array.isArray(result.payload?.messages)) {
        const older = result.payload.messages.map(toHubMessage);
        const oldest = older[older.length - 1];
        set((s) => ({
          messages: [...s.messages, ...older],
          cursor: oldest ? String(oldest.timestamp) : s.cursor,
          hasMore: older.length >= PAGE_SIZE,
          loadingMore: false,
        }));
      } else {
        set({ hasMore: false, loadingMore: false });
      }
    } catch {
      set({ loadingMore: false });
    }
  },

  addMessage: (msg) => {
    const id = `msg-${nextId++}`;
    const message: MessageHubMessage = { ...msg, id };

    set((s) => {
      const updated = [message, ...s.messages];
      if (updated.length > 100) {
        updated.length = 100;
      }
      return { messages: updated };
    });
  },

  markRead: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, read: true } : m)),
    })),

  markAllRead: (channel) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (channel && m.channel !== channel) {
          return m;
        }
        return { ...m, read: true };
      }),
    })),

  setFilter: (channel) => set({ filter: channel }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  unreadCount: () => get().messages.filter((m) => !m.read).length,

  unreadByChannel: () => {
    const counts: Record<string, number> = {};
    for (const m of get().messages) {
      if (!m.read) {
        counts[m.channel] = (counts[m.channel] ?? 0) + 1;
      }
    }
    return counts;
  },
}));
