/**
 * Echo prevention for owner pairing notifications sent to self-chat.
 *
 * When the bot sends a pairing notification to the owner's WhatsApp self-chat,
 * the message echoes back as a fromMe=true message. Without prevention, the AI
 * would try to respond to the notification. This module tracks recently-sent
 * notification texts so the message handler can skip them.
 */

const ECHO_TTL_MS = 30_000;
const MAX_ECHO_ENTRIES = 100;

const recentNotifications = new Set<string>();

/** Register a notification text before sending to self-chat. */
export function rememberOwnerNotification(text: string): void {
  if (recentNotifications.size >= MAX_ECHO_ENTRIES) {
    return; // fail-open: worst case, bot responds to its own notification
  }
  recentNotifications.add(text);
  setTimeout(() => recentNotifications.delete(text), ECHO_TTL_MS).unref();
}

/** Check if a message body matches a recently-sent owner notification. One-shot: removes on match. */
export function isOwnerNotificationEcho(text: string): boolean {
  if (recentNotifications.has(text)) {
    recentNotifications.delete(text);
    return true;
  }
  return false;
}

// --- Owner notification rate limiting ---
// Prevents flooding the owner's self-chat with many unique senders.

const OWNER_NOTIFY_WINDOW_MS = 5 * 60_000; // 5 minutes
const OWNER_NOTIFY_MAX = 10;

let ownerNotificationCount = 0;

/** Check if the owner notification rate limit allows another notification. */
export function canSendOwnerNotification(): boolean {
  return ownerNotificationCount < OWNER_NOTIFY_MAX;
}

/** Record that an owner notification was sent. Auto-decrements after the window. */
export function recordOwnerNotification(): void {
  ownerNotificationCount++;
  setTimeout(() => ownerNotificationCount--, OWNER_NOTIFY_WINDOW_MS).unref();
}
