import { describe, it, expect, beforeEach } from "vitest";
import { useMessageHubStore } from "../message-hub-store";

const initialState = useMessageHubStore.getState();

describe("message-hub-store", () => {
  beforeEach(() => {
    useMessageHubStore.setState(initialState, true);
  });

  it("initial state loads 14 demo messages", () => {
    expect(useMessageHubStore.getState().messages).toHaveLength(14);
  });

  it("initial filter is null and searchQuery is empty", () => {
    const s = useMessageHubStore.getState();
    expect(s.filter).toBeNull();
    expect(s.searchQuery).toBe("");
  });

  it("addMessage prepends and assigns an id", () => {
    useMessageHubStore.getState().addMessage({
      channel: "telegram",
      channelIcon: "/icons/messaging-channels/telegram.svg",
      sender: "Test User",
      preview: "Hello world",
      timestamp: Date.now(),
      read: false,
      priority: "normal",
      type: "message",
    });

    const msgs = useMessageHubStore.getState().messages;
    expect(msgs).toHaveLength(15);
    expect(msgs[0].sender).toBe("Test User");
    expect(msgs[0].id).toBeTruthy();
  });

  it("addMessage caps at 100 messages", () => {
    for (let i = 0; i < 90; i++) {
      useMessageHubStore.getState().addMessage({
        channel: "discord",
        channelIcon: "",
        sender: `user-${i}`,
        preview: `msg-${i}`,
        timestamp: Date.now(),
        read: false,
        priority: "normal",
        type: "message",
      });
    }
    expect(useMessageHubStore.getState().messages.length).toBeLessThanOrEqual(100);
  });

  it("markRead marks a specific message", () => {
    const id = useMessageHubStore.getState().messages.find((m) => !m.read)!.id;
    useMessageHubStore.getState().markRead(id);
    const msg = useMessageHubStore.getState().messages.find((m) => m.id === id);
    expect(msg?.read).toBe(true);
  });

  it("markRead is a no-op for unknown id", () => {
    const before = useMessageHubStore.getState().messages.map((m) => m.read);
    useMessageHubStore.getState().markRead("nonexistent-id");
    const after = useMessageHubStore.getState().messages.map((m) => m.read);
    expect(after).toEqual(before);
  });

  it("markAllRead marks all messages", () => {
    useMessageHubStore.getState().markAllRead();
    const unread = useMessageHubStore.getState().messages.filter((m) => !m.read);
    expect(unread).toHaveLength(0);
  });

  it("markAllRead with channel only marks that channel", () => {
    const beforeDiscordUnread = useMessageHubStore
      .getState()
      .messages.filter((m) => m.channel === "discord" && !m.read).length;
    expect(beforeDiscordUnread).toBeGreaterThan(0);

    useMessageHubStore.getState().markAllRead("discord");

    const afterDiscordUnread = useMessageHubStore
      .getState()
      .messages.filter((m) => m.channel === "discord" && !m.read).length;
    expect(afterDiscordUnread).toBe(0);

    const telegramUnread = useMessageHubStore
      .getState()
      .messages.filter((m) => m.channel === "telegram" && !m.read).length;
    expect(telegramUnread).toBeGreaterThan(0);
  });

  it("setFilter and setSearchQuery update state", () => {
    useMessageHubStore.getState().setFilter("slack");
    expect(useMessageHubStore.getState().filter).toBe("slack");

    useMessageHubStore.getState().setSearchQuery("hello");
    expect(useMessageHubStore.getState().searchQuery).toBe("hello");

    useMessageHubStore.getState().setFilter(null);
    expect(useMessageHubStore.getState().filter).toBeNull();
  });

  it("unreadCount returns correct count", () => {
    const count = useMessageHubStore.getState().unreadCount();
    const manual = useMessageHubStore.getState().messages.filter((m) => !m.read).length;
    expect(count).toBe(manual);
    expect(count).toBeGreaterThan(0);
  });

  it("unreadByChannel returns correct breakdown", () => {
    const byChannel = useMessageHubStore.getState().unreadByChannel();
    expect(typeof byChannel).toBe("object");

    const total = Object.values(byChannel).reduce((a, b) => a + b, 0);
    expect(total).toBe(useMessageHubStore.getState().unreadCount());
  });
});
