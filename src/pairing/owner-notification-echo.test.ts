import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnerNotificationEcho, rememberOwnerNotification } from "./owner-notification-echo.js";

describe("owner-notification-echo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("remembers and detects echoed notification text", () => {
    const text = "New pairing request from John (+1555)";
    rememberOwnerNotification(text);
    expect(isOwnerNotificationEcho(text)).toBe(true);
  });

  it("returns false for text that was not remembered", () => {
    expect(isOwnerNotificationEcho("Hello world")).toBe(false);
  });

  it("deletes entry after detection (one-shot)", () => {
    const text = "New pairing request from Jane (+1666)";
    rememberOwnerNotification(text);
    expect(isOwnerNotificationEcho(text)).toBe(true);
    // Second check should not match (deleted on first match)
    expect(isOwnerNotificationEcho(text)).toBe(false);
  });

  it("does not match different text", () => {
    rememberOwnerNotification("notification A");
    expect(isOwnerNotificationEcho("notification B")).toBe(false);
  });
});
