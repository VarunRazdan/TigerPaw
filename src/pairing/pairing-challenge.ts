import { buildPairingReply } from "./pairing-messages.js";

type PairingMeta = Record<string, string | undefined>;

export type PairingChallengeParams = {
  channel: string;
  senderId: string;
  senderIdLine: string;
  meta?: PairingMeta;
  upsertPairingRequest: (params: {
    id: string;
    meta?: PairingMeta;
  }) => Promise<{ code: string; created: boolean }>;
  sendPairingReply: (text: string) => Promise<void>;
  buildReplyText?: (params: { code: string; senderIdLine: string }) => string;
  /** Optional: send a private notification to the bot owner (e.g., WhatsApp self-chat). */
  sendOwnerNotification?: (params: { code: string; senderIdLine: string }) => Promise<void>;
  /** When true, send the reply even on duplicate requests (created=false). Default: false. */
  replyOnDuplicate?: boolean;
  onCreated?: (params: { code: string }) => void;
  onReplyError?: (err: unknown) => void;
};

/**
 * Shared pairing challenge issuance for DM pairing policy pathways.
 * Ensures every channel follows the same create-if-missing + reply flow.
 */
export async function issuePairingChallenge(
  params: PairingChallengeParams,
): Promise<{ created: boolean; code?: string }> {
  const { code, created } = await params.upsertPairingRequest({
    id: params.senderId,
    meta: params.meta,
  });
  if (created) {
    params.onCreated?.({ code });
  }

  // Send the reply to the sender. By default only on first request (created=true).
  // WhatsApp opts into replyOnDuplicate so the sender always gets a friendly message.
  if (created || params.replyOnDuplicate) {
    const replyText =
      params.buildReplyText?.({ code, senderIdLine: params.senderIdLine }) ??
      buildPairingReply({
        channel: params.channel,
        idLine: params.senderIdLine,
        code,
      });
    try {
      await params.sendPairingReply(replyText);
    } catch (err) {
      params.onReplyError?.(err);
    }
  }

  // Only notify the owner on the first request (not on repeats).
  if (created && params.sendOwnerNotification) {
    try {
      await params.sendOwnerNotification({ code, senderIdLine: params.senderIdLine });
    } catch (err) {
      params.onReplyError?.(err);
    }
  }
  return { created, code };
}
