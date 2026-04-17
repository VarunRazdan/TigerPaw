import { formatCliCommand } from "../cli/command-format.js";
import type { PairingChannel } from "./pairing-store.js";

/** Technical pairing reply (legacy, used by non-WhatsApp channels). */
export function buildPairingReply(params: {
  channel: PairingChannel;
  idLine: string;
  code: string;
}): string {
  const { channel, idLine, code } = params;
  return [
    "Tigerpaw: access not configured.",
    "",
    idLine,
    "",
    `Pairing code: ${code}`,
    "",
    "Ask the bot owner to approve with:",
    formatCliCommand(`tigerpaw pairing approve ${channel} ${code}`),
  ].join("\n");
}

/** Friendly message sent to the unknown sender (no technical details). */
export function buildSenderFriendlyReply(): string {
  return "Tigerpaw: Hi! I'm not set up to chat with you yet. The owner has been notified.";
}

/** Notification sent privately to the bot owner with approval details. */
export function buildOwnerPairingNotification(params: {
  channel: PairingChannel;
  senderName?: string;
  senderId: string;
  code: string;
}): string {
  const { channel, senderName, senderId, code } = params;
  const nameDisplay = senderName ? `${senderName} (${senderId})` : senderId;
  return [
    `New pairing request from ${nameDisplay}`,
    "",
    `Pairing code: ${code}`,
    "",
    "Approve with:",
    formatCliCommand(`tigerpaw pairing approve ${channel} ${code}`),
  ].join("\n");
}
