import {
  buildMentionRegexes,
  matchesMentionPatterns,
  normalizeMentionText,
} from "../../auto-reply/reply/mentions.js";
import { loadConfig } from "../../config/config.js";
import {
  resolveOpenProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "../../config/runtime-group-policy.js";
import { logVerbose } from "../../globals.js";
import {
  canSendOwnerNotification,
  recordOwnerNotification,
  rememberOwnerNotification,
} from "../../pairing/owner-notification-echo.js";
import { issuePairingChallenge } from "../../pairing/pairing-challenge.js";
import {
  buildOwnerPairingNotification,
  buildSenderFriendlyReply,
} from "../../pairing/pairing-messages.js";
import { upsertChannelPairingRequest } from "../../pairing/pairing-store.js";
import {
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithLists,
} from "../../security/dm-policy-shared.js";
import { isSelfChatMode, normalizeE164 } from "../../utils.js";
import { resolveWhatsAppAccount } from "../accounts.js";

export type InboundAccessControlResult = {
  allowed: boolean;
  shouldMarkRead: boolean;
  isSelfChat: boolean;
  resolvedAccountId: string;
};

const PAIRING_REPLY_HISTORY_GRACE_MS = 30_000;

function resolveWhatsAppRuntimeGroupPolicy(params: {
  providerConfigPresent: boolean;
  groupPolicy?: "open" | "allowlist" | "disabled";
  defaultGroupPolicy?: "open" | "allowlist" | "disabled";
}): {
  groupPolicy: "open" | "allowlist" | "disabled";
  providerMissingFallbackApplied: boolean;
} {
  return resolveOpenProviderRuntimeGroupPolicy({
    providerConfigPresent: params.providerConfigPresent,
    groupPolicy: params.groupPolicy,
    defaultGroupPolicy: params.defaultGroupPolicy,
  });
}

export async function checkInboundAccessControl(params: {
  accountId: string;
  from: string;
  selfE164: string | null;
  senderE164: string | null;
  group: boolean;
  pushName?: string;
  isFromMe: boolean;
  messageTimestampMs?: number;
  connectedAtMs?: number;
  pairingGraceMs?: number;
  sock: {
    sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
  };
  remoteJid: string;
  selfJid?: string | null;
  body?: string;
}): Promise<InboundAccessControlResult> {
  const cfg = loadConfig();
  const account = resolveWhatsAppAccount({
    cfg,
    accountId: params.accountId,
  });
  const dmPolicy = account.dmPolicy ?? "pairing";
  const configuredAllowFrom = account.allowFrom ?? [];
  const storeAllowFrom = await readStoreAllowFromForDmPolicy({
    provider: "whatsapp",
    accountId: account.accountId,
    dmPolicy,
  });
  // Without user config, default to self-only DM access so the owner can talk to themselves.
  const defaultAllowFrom =
    configuredAllowFrom.length === 0 && params.selfE164 ? [params.selfE164] : [];
  const dmAllowFrom = configuredAllowFrom.length > 0 ? configuredAllowFrom : defaultAllowFrom;
  const groupAllowFrom =
    account.groupAllowFrom ?? (configuredAllowFrom.length > 0 ? configuredAllowFrom : undefined);
  const isSamePhone = params.from === params.selfE164;
  const isSelfChat = account.selfChatMode ?? isSelfChatMode(params.selfE164, configuredAllowFrom);
  const pairingGraceMs =
    typeof params.pairingGraceMs === "number" && params.pairingGraceMs > 0
      ? params.pairingGraceMs
      : PAIRING_REPLY_HISTORY_GRACE_MS;
  const suppressPairingReply =
    typeof params.connectedAtMs === "number" &&
    typeof params.messageTimestampMs === "number" &&
    params.messageTimestampMs < params.connectedAtMs - pairingGraceMs;

  // Group policy filtering:
  // - "open": groups bypass allowFrom, only mention-gating applies
  // - "disabled": block all group messages entirely
  // - "allowlist": only allow group messages from senders in groupAllowFrom/allowFrom
  const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
  const { groupPolicy, providerMissingFallbackApplied } = resolveWhatsAppRuntimeGroupPolicy({
    providerConfigPresent: cfg.channels?.whatsapp !== undefined,
    groupPolicy: account.groupPolicy,
    defaultGroupPolicy,
  });
  warnMissingProviderGroupPolicyFallbackOnce({
    providerMissingFallbackApplied,
    providerKey: "whatsapp",
    accountId: account.accountId,
    log: (message) => logVerbose(message),
  });
  const normalizedDmSender = normalizeE164(params.from);
  const normalizedGroupSender =
    typeof params.senderE164 === "string" ? normalizeE164(params.senderE164) : null;
  const access = resolveDmGroupAccessWithLists({
    isGroup: params.group,
    dmPolicy,
    groupPolicy,
    // Groups intentionally fall back to configured allowFrom only (not DM self-chat fallback).
    allowFrom: params.group ? configuredAllowFrom : dmAllowFrom,
    groupAllowFrom,
    storeAllowFrom,
    isSenderAllowed: (allowEntries) => {
      const hasWildcard = allowEntries.includes("*");
      if (hasWildcard) {
        return true;
      }
      const normalizedEntrySet = new Set(
        allowEntries
          .map((entry) => normalizeE164(String(entry)))
          .filter((entry): entry is string => Boolean(entry)),
      );
      if (!params.group && isSamePhone) {
        return true;
      }
      if (params.group) {
        // Sender-level: check sender E.164 against normalized entries
        if (normalizedGroupSender && normalizedEntrySet.has(normalizedGroupSender)) {
          return true;
        }
        // Group-level: entries that look like group JIDs (e.g. "120363xxx@g.us")
        // are dropped by normalizeE164, so match them raw against remoteJid.
        return allowEntries.some((entry) => String(entry).trim() === params.remoteJid);
      }
      return normalizedEntrySet.has(normalizedDmSender);
    },
  });
  if (params.group && access.decision !== "allow") {
    // Owner messages always pass through in groups so they can run !group add
    if (params.isFromMe) {
      logVerbose("Allowing owner group message (fromMe) despite group policy");
    } else {
      if (access.reason === "groupPolicy=disabled") {
        logVerbose("Blocked group message (groupPolicy: disabled)");
      } else if (access.reason === "groupPolicy=allowlist (empty allowlist)") {
        logVerbose("Blocked group message (groupPolicy: allowlist, no groupAllowFrom)");
      } else {
        logVerbose(
          `Blocked group message from ${params.senderE164 ?? "unknown sender"} (groupPolicy: allowlist)`,
        );
      }
      return {
        allowed: false,
        shouldMarkRead: false,
        isSelfChat,
        resolvedAccountId: account.accountId,
      };
    }
  }

  // DM access control (secure defaults): "pairing" (default) / "allowlist" / "open" / "disabled".
  if (!params.group) {
    if (params.isFromMe && !isSamePhone) {
      // Allow owner's @TP messages through so the bot can respond in other people's chats
      const mentionRegexes = buildMentionRegexes(cfg);
      const hasMention =
        mentionRegexes.length > 0 &&
        matchesMentionPatterns(normalizeMentionText(params.body ?? ""), mentionRegexes);
      if (!hasMention) {
        logVerbose("Skipping outbound DM (fromMe, no @TP prefix).");
        return {
          allowed: false,
          shouldMarkRead: false,
          isSelfChat,
          resolvedAccountId: account.accountId,
        };
      }
      logVerbose("Allowing owner outbound DM with @TP prefix.");
      return {
        allowed: true,
        shouldMarkRead: false,
        isSelfChat,
        resolvedAccountId: account.accountId,
      };
    }
    if (access.decision === "block" && access.reason === "dmPolicy=disabled") {
      logVerbose("Blocked dm (dmPolicy: disabled)");
      return {
        allowed: false,
        shouldMarkRead: false,
        isSelfChat,
        resolvedAccountId: account.accountId,
      };
    }
    if (access.decision === "pairing" && !isSamePhone) {
      const candidate = params.from;
      // Only trigger pairing when the message contains the mention prefix (e.g. @TP).
      // Without it, stay silent — the message is meant for the person, not the bot.
      const mentionRegexes = buildMentionRegexes(cfg);
      const hasMentionPrefix =
        mentionRegexes.length === 0 ||
        matchesMentionPatterns(normalizeMentionText(params.body ?? ""), mentionRegexes);
      if (suppressPairingReply || !hasMentionPrefix) {
        logVerbose(
          hasMentionPrefix
            ? `Skipping pairing reply for historical DM from ${candidate}.`
            : `Skipping pairing reply for ${candidate} (no mention prefix).`,
        );
      } else {
        await issuePairingChallenge({
          channel: "whatsapp",
          senderId: candidate,
          senderIdLine: `Your WhatsApp phone number: ${candidate}`,
          meta: { name: (params.pushName ?? "").trim() || undefined },
          upsertPairingRequest: async ({ id, meta }) =>
            await upsertChannelPairingRequest({
              channel: "whatsapp",
              id,
              accountId: account.accountId,
              meta,
            }),
          buildReplyText: () => buildSenderFriendlyReply(),
          replyOnDuplicate: true,
          onCreated: () => {
            logVerbose(
              `whatsapp pairing request sender=${candidate} name=${params.pushName ?? "unknown"}`,
            );
          },
          sendPairingReply: async (text) => {
            await params.sock.sendMessage(params.remoteJid, { text });
          },
          sendOwnerNotification:
            params.selfJid && canSendOwnerNotification()
              ? async ({ code }) => {
                  const text = buildOwnerPairingNotification({
                    channel: "whatsapp",
                    senderName: (params.pushName ?? "").trim() || undefined,
                    senderId: candidate,
                    code,
                  });
                  // Strip device suffix (e.g. "15551234567:12@s.whatsapp.net" -> "15551234567@s.whatsapp.net")
                  const bareJid = params.selfJid!.replace(/:\d+@/, "@");
                  rememberOwnerNotification(text);
                  recordOwnerNotification();
                  await params.sock.sendMessage(bareJid, { text });
                }
              : undefined,
          onReplyError: (err) => {
            logVerbose(`whatsapp pairing reply failed for ${candidate}: ${String(err)}`);
          },
        });
      }
      return {
        allowed: false,
        shouldMarkRead: false,
        isSelfChat,
        resolvedAccountId: account.accountId,
      };
    }
    if (access.decision !== "allow") {
      logVerbose(`Blocked unauthorized sender ${params.from} (dmPolicy=${dmPolicy})`);
      return {
        allowed: false,
        shouldMarkRead: false,
        isSelfChat,
        resolvedAccountId: account.accountId,
      };
    }
  }

  return {
    allowed: true,
    shouldMarkRead: true,
    isSelfChat,
    resolvedAccountId: account.accountId,
  };
}

export const __testing = {
  resolveWhatsAppRuntimeGroupPolicy,
};
