import type { getReplyFromConfig } from "../../../auto-reply/reply.js";
import type { MsgContext } from "../../../auto-reply/templating.js";
import { loadConfig } from "../../../config/config.js";
import { readConfigFileSnapshotForWrite, writeConfigFile } from "../../../config/io.js";
import { logVerbose } from "../../../globals.js";
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
