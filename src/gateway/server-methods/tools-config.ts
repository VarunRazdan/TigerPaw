/**
 * Gateway RPC handlers for tool configuration (web search, firecrawl).
 * Provides test endpoints to validate API keys before saving.
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const SEARCH_TEST_TIMEOUT_MS = 10_000;

async function testBraveSearch(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(SEARCH_TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Brave API error: ${res.status}` };
  }
  return { ok: true };
}

async function testGeminiSearch(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
    signal: AbortSignal.timeout(SEARCH_TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Gemini API error: ${res.status}` };
  }
  return { ok: true };
}

async function testGrokSearch(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(SEARCH_TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Grok API error: ${res.status}` };
  }
  return { ok: true };
}

async function testKimiSearch(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.moonshot.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(SEARCH_TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Kimi API error: ${res.status}` };
  }
  return { ok: true };
}

async function testPerplexitySearch(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(SEARCH_TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Perplexity API error: ${res.status}` };
  }
  return { ok: true };
}

async function testFirecrawl(
  apiKey: string,
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${baseUrl || "https://api.firecrawl.dev"}/v2/scrape`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
    signal: AbortSignal.timeout(SEARCH_TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Firecrawl API error: ${res.status}` };
  }
  return { ok: true };
}

const SEARCH_TESTERS: Record<string, (apiKey: string) => Promise<{ ok: boolean; error?: string }>> =
  {
    brave: testBraveSearch,
    gemini: testGeminiSearch,
    grok: testGrokSearch,
    kimi: testKimiSearch,
    perplexity: testPerplexitySearch,
  };

export const toolsConfigHandlers: GatewayRequestHandlers = {
  "tools.search.test": async ({ params, respond }) => {
    const provider = String((params.provider as string) ?? "").trim();
    const apiKey = String((params.apiKey as string) ?? "").trim();

    if (!provider || !apiKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "provider and apiKey are required"),
      );
      return;
    }

    const tester = SEARCH_TESTERS[provider];
    if (!tester) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Unknown search provider: ${provider}`),
      );
      return;
    }

    try {
      const result = await tester(apiKey);
      respond(true, result, undefined);
    } catch (err) {
      respond(
        true,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        undefined,
      );
    }
  },

  "tools.fetch.test": async ({ params, respond }) => {
    const apiKey = String((params.apiKey as string) ?? "").trim();
    const baseUrl = params.baseUrl ? String(params.baseUrl as string).trim() : undefined;

    if (!apiKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "apiKey is required"));
      return;
    }

    try {
      const result = await testFirecrawl(apiKey, baseUrl);
      respond(true, result, undefined);
    } catch (err) {
      respond(
        true,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        undefined,
      );
    }
  },
};
