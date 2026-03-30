/**
 * Static models catalog — ships with each release.
 * Updated: 2026-03-27
 *
 * Pricing is in USD per 1 million tokens.
 * Context windows are in tokens.
 * This file is the offline fallback; users can "Refresh" to fetch
 * live model lists from provider APIs via onboarding.models RPC.
 */

export type CatalogModel = {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  pricing: { input: number; output: number };
  reasoning?: boolean;
};

export type ProviderCatalog = {
  models: CatalogModel[];
  lastUpdated: string;
};

export const MODELS_CATALOG: Record<string, ProviderCatalog> = {
  anthropic: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        contextWindow: 200_000,
        maxOutput: 32_000,
        pricing: { input: 15, output: 75 },
        reasoning: true,
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        contextWindow: 200_000,
        maxOutput: 16_000,
        pricing: { input: 3, output: 15 },
        reasoning: true,
      },
      {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        contextWindow: 200_000,
        maxOutput: 8_192,
        pricing: { input: 0.8, output: 4 },
      },
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        contextWindow: 200_000,
        maxOutput: 16_000,
        pricing: { input: 3, output: 15 },
        reasoning: true,
      },
    ],
  },

  openai: {
    lastUpdated: "2026-03-30",
    models: [
      {
        id: "gpt-5.2",
        name: "GPT-5.2",
        contextWindow: 400_000,
        maxOutput: 128_000,
        pricing: { input: 7.5, output: 30 },
      },
      {
        id: "gpt-5.1",
        name: "GPT-5.1",
        contextWindow: 400_000,
        maxOutput: 128_000,
        pricing: { input: 5, output: 20 },
      },
      {
        id: "gpt-5.1-codex",
        name: "GPT-5.1 Codex",
        contextWindow: 400_000,
        maxOutput: 128_000,
        pricing: { input: 2.5, output: 10 },
      },
      {
        id: "gpt-5.1-codex-mini",
        name: "GPT-5.1 Codex Mini",
        contextWindow: 400_000,
        maxOutput: 128_000,
        pricing: { input: 0.6, output: 2.4 },
      },
      {
        id: "o3",
        name: "o3",
        contextWindow: 200_000,
        maxOutput: 100_000,
        pricing: { input: 10, output: 40 },
        reasoning: true,
      },
      {
        id: "o4-mini",
        name: "o4-mini",
        contextWindow: 200_000,
        maxOutput: 100_000,
        pricing: { input: 1.1, output: 4.4 },
        reasoning: true,
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        contextWindow: 1_047_576,
        maxOutput: 32_768,
        pricing: { input: 2, output: 8 },
      },
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        contextWindow: 1_047_576,
        maxOutput: 32_768,
        pricing: { input: 0.4, output: 1.6 },
      },
      {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano",
        contextWindow: 1_047_576,
        maxOutput: 32_768,
        pricing: { input: 0.1, output: 0.4 },
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        contextWindow: 128_000,
        maxOutput: 16_384,
        pricing: { input: 2.5, output: 10 },
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        contextWindow: 128_000,
        maxOutput: 16_384,
        pricing: { input: 0.15, output: 0.6 },
      },
    ],
  },

  google: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        contextWindow: 1_048_576,
        maxOutput: 65_536,
        pricing: { input: 1.25, output: 10 },
        reasoning: true,
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        contextWindow: 1_048_576,
        maxOutput: 65_536,
        pricing: { input: 0.15, output: 0.6 },
        reasoning: true,
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        contextWindow: 1_048_576,
        maxOutput: 8_192,
        pricing: { input: 0.1, output: 0.4 },
      },
      {
        id: "gemini-2.0-flash-lite",
        name: "Gemini 2.0 Flash Lite",
        contextWindow: 1_048_576,
        maxOutput: 8_192,
        pricing: { input: 0.075, output: 0.3 },
      },
    ],
  },

  deepseek: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek-V3",
        contextWindow: 65_536,
        maxOutput: 8_192,
        pricing: { input: 0.27, output: 1.1 },
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek-R1",
        contextWindow: 65_536,
        maxOutput: 8_192,
        pricing: { input: 0.55, output: 2.19 },
        reasoning: true,
      },
    ],
  },

  groq: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        contextWindow: 128_000,
        maxOutput: 32_768,
        pricing: { input: 0.59, output: 0.79 },
      },
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 0.05, output: 0.08 },
      },
      {
        id: "gemma2-9b-it",
        name: "Gemma 2 9B",
        contextWindow: 8_192,
        maxOutput: 8_192,
        pricing: { input: 0.2, output: 0.2 },
      },
      {
        id: "mixtral-8x7b-32768",
        name: "Mixtral 8x7B",
        contextWindow: 32_768,
        maxOutput: 32_768,
        pricing: { input: 0.24, output: 0.24 },
      },
      {
        id: "deepseek-r1-distill-llama-70b",
        name: "DeepSeek R1 Distill 70B",
        contextWindow: 128_000,
        maxOutput: 16_384,
        pricing: { input: 0.75, output: 0.99 },
        reasoning: true,
      },
    ],
  },

  mistral: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "mistral-large-latest",
        name: "Mistral Large",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 2, output: 6 },
      },
      {
        id: "mistral-medium-latest",
        name: "Mistral Medium",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 1, output: 3 },
      },
      {
        id: "mistral-small-latest",
        name: "Mistral Small",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 0.25, output: 0.75 },
      },
      {
        id: "codestral-latest",
        name: "Codestral",
        contextWindow: 256_000,
        maxOutput: 8_192,
        pricing: { input: 0.3, output: 0.9 },
      },
      {
        id: "open-mistral-nemo",
        name: "Mistral Nemo",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 0.15, output: 0.15 },
      },
    ],
  },

  xai: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "grok-3",
        name: "Grok 3",
        contextWindow: 131_072,
        maxOutput: 16_384,
        pricing: { input: 3, output: 15 },
      },
      {
        id: "grok-3-mini",
        name: "Grok 3 Mini",
        contextWindow: 131_072,
        maxOutput: 16_384,
        pricing: { input: 0.3, output: 0.5 },
        reasoning: true,
      },
      {
        id: "grok-2",
        name: "Grok 2",
        contextWindow: 131_072,
        maxOutput: 8_192,
        pricing: { input: 2, output: 10 },
      },
    ],
  },

  perplexity: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "sonar-pro",
        name: "Sonar Pro",
        contextWindow: 200_000,
        maxOutput: 8_192,
        pricing: { input: 3, output: 15 },
      },
      {
        id: "sonar",
        name: "Sonar",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 1, output: 5 },
      },
      {
        id: "sonar-reasoning-pro",
        name: "Sonar Reasoning Pro",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 2, output: 8 },
        reasoning: true,
      },
      {
        id: "sonar-reasoning",
        name: "Sonar Reasoning",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 1, output: 5 },
        reasoning: true,
      },
      {
        id: "sonar-deep-research",
        name: "Sonar Deep Research",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 2, output: 8 },
      },
    ],
  },

  ollama: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "llama3.3:70b",
        name: "Llama 3.3 70B",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 0, output: 0 },
      },
      {
        id: "llama3.2:latest",
        name: "Llama 3.2",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 0, output: 0 },
      },
      {
        id: "qwen2.5:32b",
        name: "Qwen 2.5 32B",
        contextWindow: 128_000,
        maxOutput: 8_192,
        pricing: { input: 0, output: 0 },
      },
      {
        id: "mistral:latest",
        name: "Mistral 7B",
        contextWindow: 32_768,
        maxOutput: 8_192,
        pricing: { input: 0, output: 0 },
      },
      {
        id: "phi3:latest",
        name: "Phi-3",
        contextWindow: 128_000,
        maxOutput: 4_096,
        pricing: { input: 0, output: 0 },
      },
      {
        id: "deepseek-r1:14b",
        name: "DeepSeek R1 14B",
        contextWindow: 65_536,
        maxOutput: 8_192,
        pricing: { input: 0, output: 0 },
        reasoning: true,
      },
    ],
  },

  lmstudio: {
    lastUpdated: "2026-03-27",
    models: [
      {
        id: "any-gguf",
        name: "Any GGUF Model",
        contextWindow: 0,
        maxOutput: 0,
        pricing: { input: 0, output: 0 },
      },
    ],
  },
};

/** Format token count for display: 128000 → "128K", 1048576 → "1M" */
export function formatTokens(n: number): string {
  if (n === 0) {
    return "—";
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  }
  return String(n);
}

/** Format price for display: 0 → "Free", 0.15 → "$0.15", 15 → "$15" */
export function formatPrice(pricePerMillion: number): string {
  if (pricePerMillion === 0) {
    return "Free";
  }
  return `$${pricePerMillion}`;
}
