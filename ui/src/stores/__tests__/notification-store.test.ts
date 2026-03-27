import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub i18n before importing the store (it uses i18n.t at runtime)
vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}));

const { useNotificationStore, eventSeverity, eventTitle } = await import("../notification-store");

const initialState = useNotificationStore.getState();

describe("notification-store", () => {
  beforeEach(() => {
    useNotificationStore.setState(initialState, true);
  });

  it("initial state loads 8 demo notifications", () => {
    expect(useNotificationStore.getState().notifications).toHaveLength(8);
  });

  it("initial flags: toasts enabled, browser notifications disabled", () => {
    const s = useNotificationStore.getState();
    expect(s.toastsEnabled).toBe(true);
    expect(s.browserNotificationsEnabled).toBe(false);
  });

  it("addNotification prepends and assigns an id", () => {
    useNotificationStore.getState().addNotification({
      type: "trading.order.approved",
      title: "Test",
      description: "Test desc",
      severity: "success",
      timestamp: Date.now(),
    });

    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].title).toBe("Test");
    expect(notifs[0].id).toBeTruthy();
    expect(notifs[0].dismissed).toBe(false);
    expect(notifs).toHaveLength(9);
  });

  it("addNotification caps at 50 notifications", () => {
    for (let i = 0; i < 50; i++) {
      useNotificationStore.getState().addNotification({
        type: "trading.order.approved",
        title: `n-${i}`,
        description: "",
        severity: "info",
        timestamp: Date.now(),
      });
    }
    expect(useNotificationStore.getState().notifications.length).toBeLessThanOrEqual(50);
  });

  it("dismissNotification marks a specific notification", () => {
    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().dismissNotification(id);
    const n = useNotificationStore.getState().notifications.find((x) => x.id === id);
    expect(n?.dismissed).toBe(true);
  });

  it("dismissNotification is a no-op for unknown id", () => {
    const before = useNotificationStore.getState().notifications.map((n) => n.dismissed);
    useNotificationStore.getState().dismissNotification("nonexistent");
    const after = useNotificationStore.getState().notifications.map((n) => n.dismissed);
    expect(after).toEqual(before);
  });

  it("clearAll marks all notifications as dismissed", () => {
    useNotificationStore.getState().clearAll();
    const undismissed = useNotificationStore.getState().notifications.filter((n) => !n.dismissed);
    expect(undismissed).toHaveLength(0);
  });

  it("setBrowserNotifications toggles the flag", () => {
    useNotificationStore.getState().setBrowserNotifications(true);
    expect(useNotificationStore.getState().browserNotificationsEnabled).toBe(true);

    useNotificationStore.getState().setBrowserNotifications(false);
    expect(useNotificationStore.getState().browserNotificationsEnabled).toBe(false);
  });

  it("setToastsEnabled toggles the flag", () => {
    useNotificationStore.getState().setToastsEnabled(false);
    expect(useNotificationStore.getState().toastsEnabled).toBe(false);

    useNotificationStore.getState().setToastsEnabled(true);
    expect(useNotificationStore.getState().toastsEnabled).toBe(true);
  });

  it("setPlatformFilter updates a specific platform", () => {
    useNotificationStore.getState().setPlatformFilter("alpaca", false);
    expect(useNotificationStore.getState().platformFilters.alpaca).toBe(false);

    useNotificationStore.getState().setPlatformFilter("alpaca", true);
    expect(useNotificationStore.getState().platformFilters.alpaca).toBe(true);
  });

  it("isPlatformEnabled returns true for known enabled platforms", () => {
    expect(useNotificationStore.getState().isPlatformEnabled("alpaca")).toBe(true);
  });

  it("isPlatformEnabled defaults to true for unknown platforms", () => {
    expect(useNotificationStore.getState().isPlatformEnabled("unknown-platform")).toBe(true);
  });

  it("undismissedCount returns correct count", () => {
    const count = useNotificationStore.getState().undismissedCount();
    const manual = useNotificationStore.getState().notifications.filter((n) => !n.dismissed).length;
    expect(count).toBe(manual);
    expect(count).toBeGreaterThan(0);
  });
});

describe("eventSeverity", () => {
  it("maps approved/filled/deactivated to success", () => {
    expect(eventSeverity("trading.order.approved")).toBe("success");
    expect(eventSeverity("trading.order.filled")).toBe("success");
    expect(eventSeverity("trading.killswitch.deactivated")).toBe("success");
  });

  it("maps denied/failed/activated to error", () => {
    expect(eventSeverity("trading.order.denied")).toBe("error");
    expect(eventSeverity("trading.order.failed")).toBe("error");
    expect(eventSeverity("trading.killswitch.activated")).toBe("error");
  });

  it("maps warning to warning", () => {
    expect(eventSeverity("trading.limit.warning")).toBe("warning");
  });

  it("defaults to info for unrecognized types", () => {
    expect(eventSeverity("trading.order.pending")).toBe("info");
    expect(eventSeverity("unknown.event")).toBe("info");
  });
});

describe("eventTitle", () => {
  it("returns a translated key for known event types", () => {
    const title = eventTitle("trading.order.approved", { symbol: "AAPL", side: "buy" });
    // With our mock, t() returns the key itself
    expect(title).toContain("notifications:orderApproved");
  });

  it("returns kill switch title for activation", () => {
    const title = eventTitle("trading.killswitch.activated", {});
    expect(title).toContain("killSwitchActivated");
  });

  it("includes extension name for platform kill switch", () => {
    const title = eventTitle("trading.killswitch.activated", { extensionId: "alpaca" });
    // With our t() mock, the interpolation key is returned; verify the platform-specific key is used
    expect(title).toContain("killSwitchExt");
  });

  it("returns fallback for unknown event type", () => {
    const title = eventTitle("some.unknown.event", {});
    expect(title).toContain("notifications:tradingEvent");
  });
});
