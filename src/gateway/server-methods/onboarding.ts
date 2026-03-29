import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type TestResult = { ok: true; detail: string } | { ok: false; error: string };

const TIMEOUT_MS = 5_000;

async function testAnthropic(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error:
        res.status === 401 ? "Invalid API key" : `API error ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  return { ok: true, detail: "API key valid" };
}

async function testOpenAI(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: res.status === 401 ? "Invalid API key" : `API error ${res.status}` };
  }
  const data = (await res.json()) as { data?: unknown[] };
  const count = Array.isArray(data?.data) ? data.data.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testOllama(baseUrl: string): Promise<TestResult> {
  const url = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${url}/api/tags`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `Ollama returned ${res.status}` };
  }
  const data = (await res.json()) as { models?: unknown[] };
  const count = Array.isArray(data?.models) ? data.models.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testLmStudio(baseUrl: string): Promise<TestResult> {
  const url = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${url}/v1/models`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, error: `LM Studio returned ${res.status}` };
  }
  const data = (await res.json()) as { data?: unknown[] };
  const count = Array.isArray(data?.data) ? data.data.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testGoogle(apiKey: string): Promise<TestResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 400 || res.status === 403
          ? "Invalid API key"
          : `Google API error ${res.status}`,
    };
  }
  const data = (await res.json()) as { models?: unknown[] };
  const count = Array.isArray(data?.models) ? data.models.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testDeepSeek(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid API key" : `DeepSeek returned ${res.status}`,
    };
  }
  const data = (await res.json()) as { data?: unknown[] };
  const count = Array.isArray(data?.data) ? data.data.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testGroq(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid API key" : `Groq returned ${res.status}`,
    };
  }
  const data = (await res.json()) as { data?: unknown[] };
  const count = Array.isArray(data?.data) ? data.data.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testMistral(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid API key" : `Mistral returned ${res.status}`,
    };
  }
  const data = (await res.json()) as { data?: unknown[] };
  const count = Array.isArray(data?.data) ? data.data.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testXai(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid API key" : `xAI returned ${res.status}`,
    };
  }
  const data = (await res.json()) as { data?: unknown[] };
  const count = Array.isArray(data?.data) ? data.data.length : 0;
  return { ok: true, detail: `${count} models available` };
}

async function testPerplexity(apiKey: string): Promise<TestResult> {
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid API key" : `Perplexity returned ${res.status}`,
    };
  }
  return { ok: true, detail: "API key valid" };
}

async function testDiscord(token: string): Promise<TestResult> {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid bot token" : `Discord returned ${res.status}`,
    };
  }
  const data = (await res.json()) as { username?: string };
  return { ok: true, detail: `Bot: ${data?.username ?? "connected"}` };
}

async function testTelegram(botToken: string): Promise<TestResult> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json()) as { ok?: boolean; result?: { first_name?: string } };
  if (!data?.ok) {
    return { ok: false, error: "Invalid bot token" };
  }
  return { ok: true, detail: `Bot: ${data.result?.first_name ?? "connected"}` };
}

async function testSlack(botToken: string): Promise<TestResult> {
  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json()) as { ok?: boolean; team?: string; error?: string };
  if (!data?.ok) {
    return { ok: false, error: data?.error ?? "Invalid token" };
  }
  return { ok: true, detail: `Team: ${data.team ?? "connected"}` };
}

async function testAlpaca(creds: Record<string, string>): Promise<TestResult> {
  const isPaper = creds.mode !== "live";
  const host = isPaper ? "paper-api.alpaca.markets" : "api.alpaca.markets";
  const res = await fetch(`https://${host}/v2/account`, {
    headers: {
      "APCA-API-KEY-ID": creds.apiKeyId ?? "",
      "APCA-API-SECRET-KEY": creds.apiSecretKey ?? "",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 403 ? "Invalid API credentials" : `Alpaca returned ${res.status}`,
    };
  }
  return { ok: true, detail: `Account verified (${isPaper ? "paper" : "live"})` };
}

async function testCoinbase(creds: Record<string, string>): Promise<TestResult> {
  const res = await fetch("https://api.coinbase.com/v2/user", {
    headers: {
      "CB-ACCESS-KEY": creds.apiKey ?? "",
      "CB-VERSION": "2024-01-01",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "Invalid API key" : `Coinbase returned ${res.status}`,
    };
  }
  return { ok: true, detail: "Account verified" };
}

type ModelEntry = { id: string; name: string };

async function fetchProviderModels(
  provider: string,
  credentials: Record<string, string>,
): Promise<ModelEntry[]> {
  const FETCH_TIMEOUT = 10_000;

  switch (provider) {
    case "anthropic": {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": credentials.apiKey ?? "", "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string; display_name?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.display_name ?? m.id ?? "" }));
    }

    case "openai": {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${credentials.apiKey ?? ""}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? [])
        .map((m) => ({ id: m.id ?? "", name: m.id ?? "" }))
        .filter((m) => {
          const id = m.id;
          // Exclude non-chat models (embeddings, tts, whisper, dall-e, moderation, etc.)
          if (id.startsWith("text-embedding")) {
            return false;
          }
          if (id.startsWith("tts-")) {
            return false;
          }
          if (id.startsWith("whisper")) {
            return false;
          }
          if (id.startsWith("dall-e")) {
            return false;
          }
          if (id.includes("moderation")) {
            return false;
          }
          if (id.includes("realtime")) {
            return false;
          }
          if (id.startsWith("babbage")) {
            return false;
          }
          if (id.startsWith("davinci")) {
            return false;
          }
          // Include everything else (gpt-*, o*, chatgpt*, gpt5*, future models)
          return true;
        })
        .toSorted((a, b) => a.id.localeCompare(b.id));
    }

    case "google": {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(credentials.apiKey ?? "")}`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
      );
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { models?: { name?: string; displayName?: string }[] };
      return (data.models ?? [])
        .filter((m) => m.name?.includes("gemini"))
        .map((m) => ({
          id: (m.name ?? "").replace("models/", ""),
          name: m.displayName ?? m.name ?? "",
        }));
    }

    case "deepseek": {
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${credentials.apiKey ?? ""}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.id ?? "" }));
    }

    case "groq": {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${credentials.apiKey ?? ""}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.id ?? "" }));
    }

    case "mistral": {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${credentials.apiKey ?? ""}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string; name?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.name ?? m.id ?? "" }));
    }

    case "xai": {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${credentials.apiKey ?? ""}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string; name?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.name ?? m.id ?? "" }));
    }

    case "custom": {
      const url = (credentials.baseUrl ?? "").replace(/\/+$/, "");
      if (!url) {
        return [];
      }
      const res = await fetch(`${url}/v1/models`, {
        headers: credentials.apiKey ? { Authorization: `Bearer ${credentials.apiKey}` } : {},
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.id ?? "" }));
    }

    case "perplexity": {
      // Perplexity doesn't have a /models endpoint; return static list
      return [
        { id: "sonar-pro", name: "Sonar Pro" },
        { id: "sonar", name: "Sonar" },
        { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro" },
        { id: "sonar-reasoning", name: "Sonar Reasoning" },
        { id: "sonar-deep-research", name: "Sonar Deep Research" },
      ];
    }

    case "ollama": {
      const url = (credentials.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
      const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { models?: { name?: string }[] };
      return (data.models ?? []).map((m) => ({ id: m.name ?? "", name: m.name ?? "" }));
    }

    case "lmstudio": {
      const url = (credentials.baseUrl ?? "http://localhost:1234").replace(/\/+$/, "");
      const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id ?? "", name: m.id ?? "" }));
    }

    default:
      return [];
  }
}

async function runProviderTest(
  provider: string,
  credentials: Record<string, string>,
): Promise<TestResult> {
  switch (provider) {
    case "anthropic":
      return testAnthropic(credentials.apiKey ?? "");
    case "openai":
      return testOpenAI(credentials.apiKey ?? "");
    case "ollama":
      return testOllama(credentials.baseUrl ?? "http://localhost:11434");
    case "lmstudio":
      return testLmStudio(credentials.baseUrl ?? "http://localhost:1234");
    case "google":
      return testGoogle(credentials.apiKey ?? "");
    case "deepseek":
      return testDeepSeek(credentials.apiKey ?? "");
    case "groq":
      return testGroq(credentials.apiKey ?? "");
    case "mistral":
      return testMistral(credentials.apiKey ?? "");
    case "xai":
      return testXai(credentials.apiKey ?? "");
    case "perplexity":
      return testPerplexity(credentials.apiKey ?? "");
    case "custom": {
      const url = (credentials.baseUrl ?? "").replace(/\/+$/, "");
      if (!url) {
        return { ok: false, error: "Base URL is required" };
      }
      const res = await fetch(`${url}/v1/models`, {
        headers: credentials.apiKey ? { Authorization: `Bearer ${credentials.apiKey}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { ok: false, error: `Provider returned ${res.status}` };
      }
      const data = (await res.json()) as { data?: unknown[] };
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      return { ok: true, detail: `${count} models available` };
    }
    case "discord":
      return testDiscord(credentials.token ?? "");
    case "telegram":
      return testTelegram(credentials.botToken ?? "");
    case "slack":
      return testSlack(credentials.botToken ?? "");
    case "alpaca":
      return testAlpaca(credentials);
    case "coinbase":
      return testCoinbase(credentials);
    default:
      // For providers without validation endpoints, accept credentials as-is
      return { ok: true, detail: "Credentials saved" };
  }
}

export const onboardingHandlers: GatewayRequestHandlers = {
  "onboarding.test": async ({ params, respond }) => {
    const provider = params.provider;
    const credentials = params.credentials;

    if (typeof provider !== "string" || !provider) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "provider is required"));
      return;
    }
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "credentials object is required"),
      );
      return;
    }

    try {
      const result = await runProviderTest(provider, credentials as Record<string, string>);
      respond(true, result, undefined);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? "Service not reachable (timeout)"
          : err instanceof Error && err.message.includes("fetch failed")
            ? "Service not reachable"
            : String(err);
      respond(true, { ok: false, error: message }, undefined);
    }
  },

  "onboarding.models": async ({ params, respond }) => {
    const provider = params.provider;
    const credentials = params.credentials;

    if (typeof provider !== "string" || !provider) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "provider is required"));
      return;
    }
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "credentials object is required"),
      );
      return;
    }

    try {
      const models = await fetchProviderModels(provider, credentials as Record<string, string>);
      respond(true, { ok: true, models }, undefined);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? "Service not reachable (timeout)"
          : err instanceof Error && err.message.includes("fetch failed")
            ? "Service not reachable"
            : String(err);
      respond(true, { ok: false, error: message, models: [] }, undefined);
    }
  },
};
