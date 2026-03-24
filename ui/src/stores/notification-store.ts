import { create } from "zustand";

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

type NotificationState = {
  notifications: TradingNotification[];
  browserNotificationsEnabled: boolean;
  addNotification: (n: Omit<TradingNotification, "id" | "dismissed">) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  setBrowserNotifications: (enabled: boolean) => void;
  undismissedCount: () => number;
};

let nextId = 1;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  browserNotificationsEnabled: false,

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

  setBrowserNotifications: (enabled) => set({ browserNotificationsEnabled: enabled }),

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
  const symbol = (payload.symbol as string) ?? "";
  const side = (payload.side as string) ?? "";
  const ext = (payload.extensionId as string) ?? "";

  switch (type) {
    case "trading.order.approved":
      return `Order Approved: ${symbol} ${side}`.trim();
    case "trading.order.denied":
      return `Order Denied: ${symbol} ${side}`.trim();
    case "trading.order.pending":
      return `Order Pending: ${symbol} ${side}`.trim();
    case "trading.order.submitted":
      return `Order Submitted: ${symbol}`.trim();
    case "trading.order.filled":
      return `Order Filled: ${symbol}`.trim();
    case "trading.order.failed":
      return `Order Failed: ${symbol}`.trim();
    case "trading.killswitch.activated":
      return ext ? `Kill Switch: ${ext}` : "Kill Switch Activated";
    case "trading.killswitch.deactivated":
      return ext ? `Kill Switch Off: ${ext}` : "Kill Switch Deactivated";
    case "trading.limit.warning":
      return `Limit Warning: ${(payload.limitName as string) ?? "approaching threshold"}`;
    default:
      return "Trading Event";
  }
}
