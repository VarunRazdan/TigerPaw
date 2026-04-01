/**
 * OpenAI integration — chat completions and embeddings.
 */

import { registerIntegration } from "../registry.js";
import type { AuthContext, IntegrationDefinition } from "../types.js";
import { fetchWithTimeout, readJsonResponse, formatApiError, str } from "./_utils.js";

const OPENAI_API = "https://api.openai.com/v1";

async function openaiRequest(
  auth: AuthContext,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const token = await auth.getAccessToken();
  const res = await fetchWithTimeout(`${OPENAI_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatApiError("OpenAI", res.status, text));
  }

  return await readJsonResponse(res);
}

const definition: IntegrationDefinition = {
  id: "openai",
  name: "OpenAI",
  description: "Generate text with GPT models and create embeddings",
  icon: "openai",
  category: "ai",
  auth: {
    type: "api_key",
    headerName: "Authorization",
    headerPrefix: "Bearer",
    envVar: "OPENAI_API_KEY",
  },
  rateLimitPerMinute: 60,
  actions: [
    {
      name: "openai.chat_completion",
      displayName: "Chat Completion",
      description: "Generate a response using OpenAI chat models",
      inputSchema: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description: "Model ID",
            enum: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
            default: "gpt-4o-mini",
          },
          system: { type: "string", description: "System prompt", format: "textarea" },
          prompt: {
            type: "string",
            description: "User message",
            format: "textarea",
            required: true,
          },
          temperature: { type: "number", description: "Sampling temperature (0-2)", default: 0.7 },
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
          finish_reason: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const messages: Array<{ role: string; content: string }> = [];
          if (input.system) {
            messages.push({ role: "system", content: str(input.system) });
          }
          messages.push({ role: "user", content: str(input.prompt) });

          const data = await openaiRequest(auth, "/chat/completions", {
            model: str(input.model ?? "gpt-4o-mini"),
            messages,
            temperature: Number(input.temperature ?? 0.7),
            max_tokens: Math.min(Number(input.max_tokens ?? 1024), 16384),
          });

          const choices = data.choices as Array<{
            message: { content: string };
            finish_reason: string;
          }>;
          return {
            content: choices?.[0]?.message?.content ?? "",
            model: data.model,
            usage: data.usage,
            finish_reason: choices?.[0]?.finish_reason ?? "stop",
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[openai.chat_completion] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "openai.embeddings",
      displayName: "Create Embeddings",
      description: "Generate vector embeddings for text",
      inputSchema: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "Text to embed",
            format: "textarea",
            required: true,
          },
          model: {
            type: "string",
            description: "Embedding model",
            enum: ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
            default: "text-embedding-3-small",
          },
        },
        required: ["input"],
      },
      outputSchema: {
        type: "object",
        properties: {
          embedding: { type: "array", description: "Vector embedding" },
          model: { type: "string" },
          usage: { type: "object" },
        },
      },
      execute: async (input, auth) => {
        try {
          const data = await openaiRequest(auth, "/embeddings", {
            input: str(input.input),
            model: str(input.model ?? "text-embedding-3-small"),
          });

          const embeddings = data.data as Array<{ embedding: number[] }>;
          return {
            embedding: embeddings?.[0]?.embedding ?? [],
            model: data.model,
            usage: data.usage,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[openai.embeddings] ${e.message}`, { cause: err });
        }
      },
    },
  ],
  triggers: [],
};

registerIntegration(definition);
