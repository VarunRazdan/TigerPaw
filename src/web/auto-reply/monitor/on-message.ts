import type { getReplyFromConfig } from "../../../auto-reply/reply.js";
import {
  buildMentionRegexes,
  matchesMentionPatterns,
  normalizeMentionText,
} from "../../../auto-reply/reply/mentions.js";
import type { MsgContext } from "../../../auto-reply/templating.js";
import { loadConfig } from "../../../config/config.js";
import { readConfigFileSnapshotForWrite, writeConfigFile } from "../../../config/io.js";
import { logVerbose } from "../../../globals.js";
import { isOwnerNotificationEcho } from "../../../pairing/owner-notification-echo.js";
import { resolveAgentRoute } from "../../../routing/resolve-route.js";
import { buildGroupHistoryKey } from "../../../routing/session-key.js";
import {
  buildCompositeKey,
  resolveUserDisplayName,
  resolveAgentNameForUser,
  setUserDisplayName,
  setUserAgentName,
  validateName,
} from "../../../user-profiles/store.js";
import { normalizeE164 } from "../../../utils.js";
import type { MentionConfig } from "../mentions.js";
import type { WebInboundMsg } from "../types.js";
import { maybeBroadcastMessage } from "./broadcast.js";
import type { EchoTracker } from "./echo.js";
import type { GroupHistoryEntry } from "./group-gating.js";
import { applyGroupGating } from "./group-gating.js";
import { updateLastRouteInBackground } from "./last-route.js";
import { resolvePeerId } from "./peer.js";
import { processMessage } from "./process-message.js";
import { isSleeping, setSleepState } from "./sleep-state.js";

export function createWebOnMessageHandler(params: {
  cfg: ReturnType<typeof loadConfig>;
  verbose: boolean;
  connectionId: string;
  maxMediaBytes: number;
  groupHistoryLimit: number;
  groupHistories: Map<string, GroupHistoryEntry[]>;
  groupMemberNames: Map<string, Map<string, string>>;
  echoTracker: EchoTracker;
  backgroundTasks: Set<Promise<unknown>>;
  replyResolver: typeof getReplyFromConfig;
  replyLogger: ReturnType<(typeof import("../../../logging.js"))["getChildLogger"]>;
  baseMentionConfig: MentionConfig;
  account: { authDir?: string; accountId?: string };
}) {
  const processForRoute = async (
    msg: WebInboundMsg,
    route: ReturnType<typeof resolveAgentRoute>,
    groupHistoryKey: string,
    opts?: {
      groupHistory?: GroupHistoryEntry[];
      suppressGroupHistoryClear?: boolean;
    },
  ) =>
    processMessage({
      cfg: params.cfg,
      msg,
      route,
      groupHistoryKey,
      groupHistories: params.groupHistories,
      groupMemberNames: params.groupMemberNames,
      connectionId: params.connectionId,
      verbose: params.verbose,
      maxMediaBytes: params.maxMediaBytes,
      replyResolver: params.replyResolver,
      replyLogger: params.replyLogger,
      backgroundTasks: params.backgroundTasks,
      rememberSentText: params.echoTracker.rememberText,
      echoHas: params.echoTracker.has,
      echoForget: params.echoTracker.forget,
      buildCombinedEchoKey: params.echoTracker.buildCombinedKey,
      groupHistory: opts?.groupHistory,
      suppressGroupHistoryClear: opts?.suppressGroupHistoryClear,
    });

  return async (msg: WebInboundMsg) => {
    const conversationId = msg.conversationId ?? msg.from;
    const peerId = resolvePeerId(msg);
    // Fresh config for bindings lookup; other routing inputs are payload-derived.
    const route = resolveAgentRoute({
      cfg: loadConfig(),
      channel: "whatsapp",
      accountId: msg.accountId,
      peer: {
        kind: msg.chatType === "group" ? "group" : "direct",
        id: peerId,
      },
    });
    const groupHistoryKey =
      msg.chatType === "group"
        ? buildGroupHistoryKey({
            channel: "whatsapp",
            accountId: route.accountId,
            peerKind: "group",
            peerId,
          })
        : route.sessionKey;

    // Same-phone mode logging retained
    if (msg.from === msg.to) {
      logVerbose(`📱 Same-phone mode detected (from === to: ${msg.from})`);
    }

    // Skip if this is an owner pairing notification we just sent to self-chat
    if (msg.body && isOwnerNotificationEcho(msg.body)) {
      logVerbose("Skipping auto-reply: detected owner pairing notification echo");
      return;
    }

    // Skip if this is a message we just sent (echo detection)
    if (params.echoTracker.has(msg.body)) {
      logVerbose("Skipping auto-reply: detected echo (message matches recently sent text)");
      params.echoTracker.forget(msg.body);
      return;
    }

    // Sleep/wake commands — only the account owner (fromMe) can toggle
    const bodyLower = (msg.body ?? "").trim().toLowerCase();
    if ((bodyLower === "!sleep" || bodyLower === "!wake") && msg.fromMe) {
      if (bodyLower === "!sleep") {
        if (isSleeping()) {
          params.echoTracker.rememberText("Already sleeping. Send !wake to wake me up.", {});
          await msg.reply("Already sleeping. Send !wake to wake me up.");
        } else {
          setSleepState(true, msg.senderE164 ?? msg.from);
          params.echoTracker.rememberText("Going to sleep. Send !wake to wake me up.", {});
          await msg.reply("Going to sleep. Send !wake to wake me up.");
        }
      } else {
        if (!isSleeping()) {
          params.echoTracker.rememberText("Already awake!", {});
          await msg.reply("Already awake!");
        } else {
          setSleepState(false, msg.senderE164 ?? msg.from);
          params.echoTracker.rememberText("I'm awake!", {});
          await msg.reply("I'm awake!");
        }
      }
      return;
    }

    // !name — anyone can set their own display name
    if (bodyLower === "!name" || bodyLower.startsWith("!name ")) {
      const rawName = bodyLower.startsWith("!name ") ? msg.body.slice(6).trim() : "";
      if (!rawName) {
        const usage = "Usage: !name <your preferred name>";
        params.echoTracker.rememberText(usage, {});
        await msg.reply(usage);
        return;
      }
      const compositeKey = buildCompositeKey(
        "whatsapp",
        msg.senderJid ?? msg.senderE164 ?? msg.from,
        msg.senderE164,
      );
      const validated = setUserDisplayName(compositeKey, rawName);
      if (!validated) {
        const fail = "Name must be 1-50 characters.";
        params.echoTracker.rememberText(fail, {});
        await msg.reply(fail);
      } else {
        const ok = `Got it! I'll call you ${validated} from now on. This takes effect in your next conversation.`;
        params.echoTracker.rememberText(ok, {});
        await msg.reply(ok);
      }
      return;
    }

    // !whoami — anyone can check their identity
    if (bodyLower === "!whoami") {
      const compositeKey = buildCompositeKey(
        "whatsapp",
        msg.senderJid ?? msg.senderE164 ?? msg.from,
        msg.senderE164,
      );
      const displayName = resolveUserDisplayName(compositeKey, msg.senderName);
      const agentName = resolveAgentNameForUser(compositeKey, "Jarvis");
      // Only show full phone to owner; mask for others
      const rawPhone = msg.senderE164 ?? "N/A";
      const phone = msg.fromMe
        ? rawPhone
        : rawPhone !== "N/A"
          ? rawPhone.slice(0, 4) + "***" + rawPhone.slice(-3)
          : "N/A";
      const info = `You are: ${displayName}\nPhone: ${phone}\nAgent: ${agentName}`;
      params.echoTracker.rememberText(info, {});
      await msg.reply(info);
      return;
    }

    // !agent — change agent name (owner: global, non-owner: per-user)
    if (bodyLower === "!agent" || bodyLower.startsWith("!agent ")) {
      const rawName = bodyLower.startsWith("!agent ") ? msg.body.slice(7).trim() : "";
      const compositeKey = buildCompositeKey(
        "whatsapp",
        msg.senderJid ?? msg.senderE164 ?? msg.from,
        msg.senderE164,
      );

      if (!rawName) {
        // Show current agent name
        const currentName = resolveAgentNameForUser(compositeKey, "Jarvis");
        const show = `Current agent name: ${currentName}`;
        params.echoTracker.rememberText(show, {});
        await msg.reply(show);
        return;
      }

      // Validate name (same rules for owner and non-owner)
      const validated = validateName(rawName);
      if (!validated) {
        const err = "Agent name must be 1-50 characters.";
        params.echoTracker.rememberText(err, {});
        await msg.reply(err);
        return;
      }

      if (msg.fromMe) {
        // Owner: update global agent name in config
        try {
          const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
          const cfg = snapshot.config;
          const updated = {
            ...cfg,
            ui: {
              ...cfg.ui,
              assistant: {
                ...cfg.ui?.assistant,
                name: validated,
              },
            },
          };
          await writeConfigFile(updated, writeOptions);
          const ok = `Agent name updated globally to ${validated}.`;
          params.echoTracker.rememberText(ok, {});
          await msg.reply(ok);
        } catch {
          const fail = "Failed to update agent name in config.";
          params.echoTracker.rememberText(fail, {});
          await msg.reply(fail);
        }
      } else {
        // Non-owner: per-user override
        const validated = setUserAgentName(compositeKey, rawName);
        if (!validated) {
          const fail = "Name must be 1-50 characters.";
          params.echoTracker.rememberText(fail, {});
          await msg.reply(fail);
        } else {
          const ok = `I'll go by ${validated} in our conversations.`;
          params.echoTracker.rememberText(ok, {});
          await msg.reply(ok);
        }
      }
      return;
    }

    // Group allowlist management — owner only
    if ((bodyLower === "!group" || bodyLower.startsWith("!group ")) && msg.fromMe) {
      const args = bodyLower.startsWith("!group ") ? bodyLower.slice(7).trim() : "";
      const inGroup = msg.chatType === "group";
      const groupJid = msg.chatId;
      const groupName = (msg.groupSubject ?? groupJid).slice(0, 80);

      if (args === "add") {
        if (!inGroup) {
          const err = "Send !group add inside the group you want to allow.";
          params.echoTracker.rememberText(err, {});
          await msg.reply(err);
          return;
        }
        try {
          const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
          const cfg = snapshot.config;
          const existing = cfg.channels?.whatsapp?.groupAllowFrom ?? [];
          if (existing.includes(groupJid)) {
            const already = `Group "${groupName}" is already allowed.`;
            params.echoTracker.rememberText(already, {});
            await msg.reply(already);
            return;
          }
          const updated = {
            ...cfg,
            channels: {
              ...cfg.channels,
              whatsapp: {
                ...cfg.channels?.whatsapp,
                groupAllowFrom: [...existing, groupJid],
              },
            },
          };
          await writeConfigFile(updated, writeOptions);
          const ok = `Group "${groupName}" added to allowlist. I'll respond here from now on.`;
          params.echoTracker.rememberText(ok, {});
          await msg.reply(ok);
        } catch {
          const fail = "Failed to update group allowlist.";
          params.echoTracker.rememberText(fail, {});
          await msg.reply(fail);
        }
        return;
      }

      if (args === "remove") {
        if (!inGroup) {
          const err = "Send !group remove inside the group you want to remove.";
          params.echoTracker.rememberText(err, {});
          await msg.reply(err);
          return;
        }
        try {
          const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
          const cfg = snapshot.config;
          const existing = cfg.channels?.whatsapp?.groupAllowFrom ?? [];
          if (!existing.includes(groupJid)) {
            const notFound = "This group isn't in the allowlist.";
            params.echoTracker.rememberText(notFound, {});
            await msg.reply(notFound);
            return;
          }
          const updated = {
            ...cfg,
            channels: {
              ...cfg.channels,
              whatsapp: {
                ...cfg.channels?.whatsapp,
                groupAllowFrom: existing.filter((e: string) => e !== groupJid),
              },
            },
          };
          await writeConfigFile(updated, writeOptions);
          const ok = `Group "${groupName}" removed from allowlist. I'll stop responding here.`;
          params.echoTracker.rememberText(ok, {});
          await msg.reply(ok);
        } catch {
          const fail = "Failed to update group allowlist.";
          params.echoTracker.rememberText(fail, {});
          await msg.reply(fail);
        }
        return;
      }

      if (args === "list") {
        const cfg = loadConfig();
        const entries = cfg.channels?.whatsapp?.groupAllowFrom ?? [];
        const groupEntries = entries.filter((e: string) => String(e).includes("@g.us"));
        if (groupEntries.length === 0) {
          const empty = "No groups allowed. Send !group add inside a group to allow it.";
          params.echoTracker.rememberText(empty, {});
          await msg.reply(empty);
        } else {
          const list = "Allowed groups:\n" + groupEntries.map((g: string) => `- ${g}`).join("\n");
          params.echoTracker.rememberText(list, {});
          await msg.reply(list);
        }
        return;
      }

      // No args: show status or help
      if (inGroup) {
        const cfg = loadConfig();
        const entries = cfg.channels?.whatsapp?.groupAllowFrom ?? [];
        const isAllowed = entries.includes(groupJid);
        const status = isAllowed
          ? "This group is allowed."
          : "This group is NOT allowed. Send !group add to allow it.";
        params.echoTracker.rememberText(status, {});
        await msg.reply(status);
      } else {
        const help = "Usage: !group add | remove | list (run add/remove inside a group).";
        params.echoTracker.rememberText(help, {});
        await msg.reply(help);
      }
      return;
    }

    // If sleeping, silently ignore all messages
    if (isSleeping()) {
      logVerbose("Skipping message: bot is sleeping");
      return;
    }

    if (msg.chatType === "group") {
      const metaCtx = {
        From: msg.from,
        To: msg.to,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: msg.chatType,
        ConversationLabel: conversationId,
        GroupSubject: msg.groupSubject,
        SenderName: msg.senderName,
        SenderId: msg.senderJid?.trim() || msg.senderE164,
        SenderE164: msg.senderE164,
        Provider: "whatsapp",
        Surface: "whatsapp",
        OriginatingChannel: "whatsapp",
        OriginatingTo: conversationId,
      } satisfies MsgContext;
      updateLastRouteInBackground({
        cfg: params.cfg,
        backgroundTasks: params.backgroundTasks,
        storeAgentId: route.agentId,
        sessionKey: route.sessionKey,
        channel: "whatsapp",
        to: conversationId,
        accountId: route.accountId,
        ctx: metaCtx,
        warn: params.replyLogger.warn.bind(params.replyLogger),
      });

      const gating = applyGroupGating({
        cfg: params.cfg,
        msg,
        conversationId,
        groupHistoryKey,
        agentId: route.agentId,
        sessionKey: route.sessionKey,
        baseMentionConfig: params.baseMentionConfig,
        authDir: params.account.authDir,
        groupHistories: params.groupHistories,
        groupHistoryLimit: params.groupHistoryLimit,
        groupMemberNames: params.groupMemberNames,
        logVerbose,
        replyLogger: params.replyLogger,
      });
      if (!gating.shouldProcess) {
        return;
      }
    } else {
      // Ensure `peerId` for DMs is stable and stored as E.164 when possible.
      if (!msg.senderE164 && peerId && peerId.startsWith("+")) {
        msg.senderE164 = normalizeE164(peerId) ?? msg.senderE164;
      }

      // DM mention gating — require @TP prefix so the bot doesn't hijack
      // every message on the owner's personal WhatsApp number.
      // Owner messages (fromMe) bypass this so self-chat always works.
      if (!msg.fromMe) {
        const mentionRegexes = buildMentionRegexes(params.cfg);
        if (mentionRegexes.length > 0) {
          const bodyClean = normalizeMentionText(msg.body ?? "");
          if (!matchesMentionPatterns(bodyClean, mentionRegexes)) {
            logVerbose("Skipping DM: no mention prefix (e.g. @TP) detected");
            return;
          }
          // Strip the @TP prefix from the body before AI processing
          for (const re of mentionRegexes) {
            msg.body = msg.body.replace(re, "").trim();
          }
        }
      }
    }

    // Broadcast groups: when we'd reply anyway, run multiple agents.
    // Does not bypass group mention/activation gating above.
    if (
      await maybeBroadcastMessage({
        cfg: params.cfg,
        msg,
        peerId,
        route,
        groupHistoryKey,
        groupHistories: params.groupHistories,
        processMessage: processForRoute,
      })
    ) {
      return;
    }

    await processForRoute(msg, route, groupHistoryKey);
  };
}
