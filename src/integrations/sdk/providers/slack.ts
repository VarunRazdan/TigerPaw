/**
 * Slack integration — send messages, react, and poll for new messages.
 *
 * Leverages the existing createSlackWebClient() from src/slack/client.ts.
 */

import { registerIntegration } from "../registry.js";
import type { AuthContext, IntegrationDefinition } from "../types.js";
import { str } from "./_utils.js";

// Dynamic import to avoid hard dependency on @slack/web-api at module level
async function getSlackClient(auth: AuthContext) {
  const token = await auth.getAccessToken();
  const { createSlackWebClient } = await import("../../../slack/client.js");
  return createSlackWebClient(token);
}

const definition: IntegrationDefinition = {
  id: "slack",
  name: "Slack",
  description: "Send messages, react to posts, and monitor channels",
  icon: "slack",
  category: "communication",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "channels:history", "chat:write", "reactions:write", "users:read"],
    clientIdEnvVar: "SLACK_CLIENT_ID",
    clientSecretEnvVar: "SLACK_CLIENT_SECRET",
  },
  rateLimitPerMinute: 50, // Slack Tier 3 is ~50/min
  actions: [
    {
      name: "slack.send_message",
      displayName: "Send Message",
      description: "Send a message to a Slack channel or DM",
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Channel ID or name (e.g. #general)",
            required: true,
          },
          text: {
            type: "string",
            description: "Message text (supports Slack mrkdwn)",
            format: "textarea",
            required: true,
          },
          thread_ts: { type: "string", description: "Thread timestamp to reply in (optional)" },
        },
        required: ["channel", "text"],
      },
      outputSchema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          channel: { type: "string" },
          ts: { type: "string", description: "Message timestamp" },
        },
      },
      execute: async (input, auth) => {
        try {
          const client = await getSlackClient(auth);
          const result = await client.chat.postMessage({
            channel: str(input.channel),
            text: str(input.text),
            ...(input.thread_ts ? { thread_ts: str(input.thread_ts) } : {}),
          });
          return { ok: result.ok, channel: result.channel, ts: result.ts };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[slack.send_message] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "slack.post_to_channel",
      displayName: "Post to Channel",
      description: "Post a formatted message to a specific channel",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel ID", required: true },
          text: { type: "string", description: "Message text", format: "textarea", required: true },
          username: { type: "string", description: "Override display name (optional)" },
          icon_emoji: { type: "string", description: "Override icon emoji (e.g. :robot_face:)" },
        },
        required: ["channel", "text"],
      },
      outputSchema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          channel: { type: "string" },
          ts: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const client = await getSlackClient(auth);
          const result = await client.chat.postMessage({
            channel: str(input.channel),
            text: str(input.text),
            ...(input.username ? { username: str(input.username) } : {}),
            ...(input.icon_emoji ? { icon_emoji: str(input.icon_emoji) } : {}),
          });
          return { ok: result.ok, channel: result.channel, ts: result.ts };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[slack.post_to_channel] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "slack.add_reaction",
      displayName: "Add Reaction",
      description: "Add an emoji reaction to a message",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel ID", required: true },
          timestamp: { type: "string", description: "Message timestamp (ts)", required: true },
          name: {
            type: "string",
            description: "Emoji name without colons (e.g. thumbsup)",
            required: true,
          },
        },
        required: ["channel", "timestamp", "name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
      },
      execute: async (input, auth) => {
        try {
          const client = await getSlackClient(auth);
          const result = await client.reactions.add({
            channel: str(input.channel),
            timestamp: str(input.timestamp),
            name: str(input.name),
          });
          return { ok: result.ok };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[slack.add_reaction] ${e.message}`, { cause: err });
        }
      },
    },
  ],
  triggers: [
    {
      name: "slack.new_message",
      displayName: "New Message",
      description: "Triggers when a new message is posted in a channel",
      type: "polling",
      pollIntervalMs: 60_000,
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel ID to watch", required: true },
        },
        required: ["channel"],
      },
      outputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          user: { type: "string" },
          ts: { type: "string" },
          channel: { type: "string" },
        },
      },
      poll: async (config, auth, lastState) => {
        try {
          const client = await getSlackClient(auth);
          const channel = str(config.channel);
          const oldest = (lastState as string) ?? String(Date.now() / 1000 - 60);

          const result = await client.conversations.history({
            channel,
            oldest,
            limit: 20,
          });

          const rawMessages = (result.messages ?? []) as Array<Record<string, unknown>>;

          // Track latestTs from ALL raw messages BEFORE filtering.
          // Slack returns messages newest-first, so iterate all for max ts.
          let latestTs = oldest;
          for (const m of rawMessages) {
            const ts = str(m.ts ?? "");
            if (ts > latestTs) {
              latestTs = ts;
            }
          }

          // Now filter system messages for the output items
          const messages = rawMessages
            .filter((m) => !m.subtype)
            .map((m) => ({
              text: m.text,
              user: m.user,
              ts: m.ts,
              channel,
            }));

          return { items: messages, newState: latestTs };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[slack.new_message] poll failed: ${e.message}`, { cause: err });
        }
      },
    },
  ],
};

registerIntegration(definition);
