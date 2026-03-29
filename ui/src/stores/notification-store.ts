import { create } from "zustand";
import i18n from "@/i18n";

export type NotificationSeverity = "info" | "warning" | "error" | "success";

export type TradingNotification = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: NotificationSeverity;
  timestamp: number;
  dismissed: boolean;
};

/** Per-platform notification filter. Key = platform ID, value = enabled. */
export type PlatformNotificationFilters = Record<string, boolean>;

type NotificationState = {
  notifications: TradingNotification[];
  demoMode: boolean;
  browserNotificationsEnabled: boolean;
  toastsEnabled: boolean;
  platformFilters: PlatformNotificationFilters;
  addNotification: (n: Omit<TradingNotification, "id" | "dismissed">) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  setDemoMode: (enabled: boolean) => void;
  setBrowserNotifications: (enabled: boolean) => void;
  setToastsEnabled: (enabled: boolean) => void;
  setPlatformFilter: (platformId: string, enabled: boolean) => void;
  isPlatformEnabled: (platformId: string) => boolean;
  undismissedCount: () => number;
};

const DEMO_NOTIFICATIONS: TradingNotification[] = [
  {
    id: "demo-1",
    type: "trading.order.approved",
    title: "Order Approved: AAPL BUY",
    description: "Auto-approved — AAPL BUY 10 shares $2,190.00 via alpaca",
    severity: "success",
    timestamp: Date.now() - 45_000,
    dismissed: false,
  },
  {
    id: "demo-2",
    type: "trading.order.denied",
    title: "Order Denied: TSLA BUY",
    description: "Daily spend limit exceeded — TSLA BUY 3 shares $850.00 via alpaca",
    severity: "error",
    timestamp: Date.now() - 120_000,
    dismissed: false,
  },
  {
    id: "demo-3",
    type: "trading.killswitch.activated",
    title: "Kill Switch Activated",
    description: "Hard mode [global] — daily loss limit breached (3.2%)",
    severity: "error",
    timestamp: Date.now() - 300_000,
    dismissed: false,
  },
  {
    id: "demo-4",
    type: "trading.limit.warning",
    title: "Limit Warning: dailySpend",
    description: "Daily spend at 82% of $100 limit",
    severity: "warning",
    timestamp: Date.now() - 600_000,
    dismissed: false,
  },
  {
    id: "demo-5",
    type: "trading.order.pending",
    title: "Order Pending: NVDA BUY",
    description: "Awaiting manual approval — NVDA BUY 5 shares $1,340.00 via alpaca",
    severity: "info",
    timestamp: Date.now() - 900_000,
    dismissed: false,
  },
  {
    id: "demo-6",
    type: "trading.order.filled",
    title: "Order Filled: BTC-USD",
    description: "BTC-USD BUY $500.00 via coinbase",
    severity: "success",
    timestamp: Date.now() - 1_200_000,
    dismissed: false,
  },
  {
    id: "demo-7",
    type: "trading.killswitch.deactivated",
    title: "Kill Switch Deactivated",
    description: "Global kill switch off — trading resumed",
    severity: "success",
    timestamp: Date.now() - 1_800_000,
    dismissed: true,
  },
  {
    id: "demo-8",
    type: "trading.order.denied",
    title: "Order Denied: Will Bitcoin hit $150k?",
    description: "Max open positions reached — via polymarket",
    severity: "error",
    timestamp: Date.now() - 2_400_000,
    dismissed: true,
  },
];

let nextId = 100;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: DEMO_NOTIFICATIONS,
  demoMode: true,
  browserNotificationsEnabled: false,
  toastsEnabled: true,
  platformFilters: {
    alpaca: true,
    polymarket: true,
    kalshi: true,
    manifold: true,
    coinbase: true,
    ibkr: true,
    binance: true,
    kraken: true,
    dydx: true,
  },

  addNotification: (n) => {
    const id = `notif-${nextId++}`;
    const notification: TradingNotification = { ...n, id, dismissed: false };

    set((s) => {
      const updated = [notification, ...s.notifications];
      // Keep max 50 notifications
      if (updated.length > 50) {
        updated.length = 50;
      }
      return { notifications: updated };
    });

    // Browser notification (opt-in)
    const state = get();
    if (
      state.browserNotificationsEnabled &&
      typeof globalThis.Notification !== "undefined" &&
      Notification.permission === "granted" &&
      (n.severity === "error" || n.severity === "warning")
    ) {
      new Notification(n.title, { body: n.description });
    }
  },

  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, dismissed: true } : n)),
    })),

  clearAll: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, dismissed: true })),
    })),

  setDemoMode: (enabled) =>
    set({
      demoMode: enabled,
      notifications: enabled ? DEMO_NOTIFICATIONS : [],
    }),

  setBrowserNotifications: (enabled) => set({ browserNotificationsEnabled: enabled }),

  setToastsEnabled: (enabled) => set({ toastsEnabled: enabled }),

  setPlatformFilter: (platformId, enabled) =>
    set((s) => ({
      platformFilters: { ...s.platformFilters, [platformId]: enabled },
    })),

  isPlatformEnabled: (platformId) => {
    const val = get().platformFilters[platformId];
    // Undefined (not in filters) defaults to enabled
    return val ?? true;
  },

  undismissedCount: () => get().notifications.filter((n) => !n.dismissed).length,
}));

/** Map a trading event type to notification severity. */
export function eventSeverity(type: string): NotificationSeverity {
  if (type.includes("approved") || type.includes("filled") || type.includes("deactivated")) {
    return "success";
  }
  if (type.includes("denied") || type.includes("failed") || type.includes("activated")) {
    return "error";
  }
  if (type.includes("warning")) {
    return "warning";
  }
  return "info";
}

/** Map a trading event type to a human-readable title prefix. */
export function eventTitle(type: string, payload: Record<string, unknown>): string {
  const t = i18n.t.bind(i18n);
  const symbol = (payload.symbol as string) ?? "";
  const side = (payload.side as string) ?? "";
  const ext = (payload.extensionId as string) ?? "";

  switch (type) {
    case "trading.order.approved":
      return t("notifications:orderApproved", { symbol, side }).trim();
    case "trading.order.denied":
      return t("notifications:orderDenied", { symbol, side }).trim();
    case "trading.order.pending":
      return t("notifications:orderPending", { symbol, side }).trim();
    case "trading.order.submitted":
      return t("notifications:orderSubmitted", { symbol }).trim();
    case "trading.order.filled":
      return t("notifications:orderFilled", { symbol }).trim();
    case "trading.order.failed":
      return t("notifications:orderFailed", { symbol }).trim();
    case "trading.killswitch.activated":
      return ext
        ? t("notifications:killSwitchExt", { extension: ext })
        : t("notifications:killSwitchActivated");
    case "trading.killswitch.deactivated":
      return ext
        ? `${t("notifications:killSwitchDeactivated")}: ${ext}`
        : t("notifications:killSwitchDeactivated");
    case "trading.limit.warning":
      return t("notifications:limitWarning", {
        limitName: (payload.limitName as string) ?? t("notifications:approachingThreshold"),
      });
    default:
      return t("notifications:tradingEvent");
  }
}
