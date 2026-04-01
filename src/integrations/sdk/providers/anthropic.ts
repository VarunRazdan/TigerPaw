/**
 * Anthropic integration — chat completions via the Messages API.
 */

import { registerIntegration } from "../registry.js";
import type { IntegrationDefinition } from "../types.js";
import { fetchWithTimeout, readJsonResponse, formatApiError, str } from "./_utils.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1";

const definition: IntegrationDefinition = {
  id: "anthropic",
  name: "Anthropic",
  description: "Generate text with Claude models via the Messages API",
  icon: "anthropic",
  category: "ai",
  auth: {
    type: "api_key",
    headerName: "x-api-key",
    envVar: "ANTHROPIC_API_KEY",
  },
  rateLimitPerMinute: 60,
  actions: [
    {
      name: "anthropic.chat_completion",
      displayName: "Chat Completion",
      description: "Generate a response using Claude models",
      inputSchema: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description: "Model ID",
            enum: [
              "claude-opus-4-6",
              "claude-sonnet-4-6",
              "claude-haiku-4-5-20251001",
              "claude-sonnet-4-5-20250514",
            ],
            default: "claude-sonnet-4-6",
          },
          system: { type: "string", description: "System prompt", format: "textarea" },
          prompt: {
            type: "string",
            description: "User message",
            format: "textarea",
            required: true,
          },
          temperature: { type: "number", description: "Sampling temperature (0-1)", default: 0.7 },
          max_tokens: { type: "number", description: "Max tokens to generate", default: 1024 },
        },
        required: ["prompt"],
      },
      outputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Generated text" },
          model: { type: "string" },
          usage: { type: "object", description: "Token usage stats" },
          stop_reason: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const token = await auth.getAccessToken();

          const body: Record<string, unknown> = {
            model: str(input.model ?? "claude-sonnet-4-6"),
            max_tokens: Math.min(Number(input.max_tokens ?? 1024), 16384),
            messages: [{ role: "user", content: str(input.prompt) }],
          };

          if (input.system) {
            body.system = str(input.system);
          }
          if (input.temperature !== undefined) {
            body.temperature = Number(input.temperature);
          }

          const res = await fetchWithTimeout(`${ANTHROPIC_API}/messages`, {
            method: "POST",
            headers: {
              "x-api-key": token,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(formatApiError("Anthropic", res.status, text));
          }

          const data = await readJsonResponse(res);
          const content = data.content as Array<{ type: string; text: string }>;

          return {
            content:
              content
                ?.filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("") ?? "",
            model: data.model,
            usage: data.usage,
            stop_reason: data.stop_reason,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[anthropic.chat_completion] ${e.message}`, { cause: err });
        }
      },
    },
  ],
  triggers: [],
};

registerIntegration(definition);
