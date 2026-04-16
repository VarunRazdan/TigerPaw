// ── Shared AI Provider definitions ──────────────────────────────────
// Single source of truth for provider metadata and config-patch builder.
// Used by: OnboardingWizard, AI Provider page (ModelsPage)

import { MODELS_CATALOG } from "./models-catalog";

// --- Types ---

export type AiProviderField = {
  name: string;
  i18nKey: string;
  type: "password" | "text";
};

export type AiProvider = {
  id: string;
  key: string;
  local?: boolean;
  pricingUrl: string;
  pricing: string;
  models: string;
  fields: AiProviderField[];
  detectPort?: number;
};

// --- Provider definitions ---

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "anthropic",
    key: "anthropic",
    pricingUrl: "https://www.anthropic.com/pricing",
    pricing: "$1-25 / 1M tokens",
    models: "Claude Opus 4.6, Sonnet 4.6, Haiku 4.5",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "openai",
    key: "openai",
    pricingUrl: "https://openai.com/api/pricing/",
    pricing: "$0.15-60 / 1M tokens",
    models: "GPT-4.1, o3, o4-mini",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "google",
    key: "google",
    pricingUrl: "https://ai.google.dev/pricing",
    pricing: "Free tier + $1.25-10 / 1M tokens",
    models: "Gemini 2.5 Pro, Flash",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "deepseek",
    key: "deepseek",
    pricingUrl: "https://platform.deepseek.com/api_keys",
    pricing: "$0.14-2.19 / 1M tokens",
    models: "DeepSeek-V3, R1",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "groq",
    key: "groq",
    pricingUrl: "https://groq.com/pricing/",
    pricing: "Free tier + $0.04-6 / 1M tokens",
    models: "Llama 4 Scout, Llama 3.3 70B, Qwen QwQ",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "mistral",
    key: "mistral",
    pricingUrl: "https://mistral.ai/products/pricing",
    pricing: "$0.02-6 / 1M tokens",
    models: "Mistral Large 3, Small 3, Pixtral",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "xai",
    key: "xai",
    pricingUrl: "https://docs.x.ai/docs/models",
    pricing: "$0.20-15 / 1M tokens",
    models: "Grok 4, Grok 4 Fast, Grok 3",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "perplexity",
    key: "perplexity",
    pricingUrl: "https://docs.perplexity.ai/guides/pricing",
    pricing: "$1-5 / 1M tokens",
    models: "Sonar Pro, Sonar, Sonar Reasoning",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "ollama",
    key: "ollama",
    local: true,
    pricingUrl: "https://ollama.com/",
    pricing: "Free — runs locally",
    models: "Llama 3, Mistral, Qwen, Phi",
    fields: [{ name: "baseUrl", i18nKey: "ai.baseUrlPlaceholder", type: "text" }],
    detectPort: 11434,
  },
  {
    id: "lmstudio",
    key: "lmstudio",
    local: true,
    pricingUrl: "https://lmstudio.ai/",
    pricing: "Free — runs locally",
    models: "Any GGUF model",
    fields: [{ name: "baseUrl", i18nKey: "ai.baseUrlPlaceholder", type: "text" }],
    detectPort: 1234,
  },
  {
    id: "custom",
    key: "custom",
    pricingUrl: "",
    pricing: "Any OpenAI-compatible API",
    models: "Bring your own provider",
    fields: [
      { name: "baseUrl", i18nKey: "ai.customBaseUrlPlaceholder", type: "text" },
      { name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" },
    ],
  },
];

export const AI_PROVIDER_MAP: Record<string, AiProvider> = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p.id, p]),
);

// --- Config patch builder ---

export function buildAiConfigPatch(
  provider: string,
  creds: Record<string, string>,
): Record<string, unknown> {
  // Provider base URLs and API types
  const PROVIDER_CONFIG: Record<string, { api: string; baseUrl: string }> = {
    anthropic: { api: "anthropic-messages", baseUrl: "https://api.anthropic.com" },
    openai: { api: "openai-completions", baseUrl: "https://api.openai.com" },
    google: {
      api: "google-generative-ai",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
    deepseek: { api: "openai-completions", baseUrl: "https://api.deepseek.com" },
    groq: { api: "openai-completions", baseUrl: "https://api.groq.com/openai" },
    mistral: { api: "openai-completions", baseUrl: "https://api.mistral.ai" },
    xai: { api: "openai-completions", baseUrl: "https://api.x.ai" },
    perplexity: { api: "openai-completions", baseUrl: "https://api.perplexity.ai" },
    ollama: { api: "ollama", baseUrl: "http://localhost:11434" },
    lmstudio: { api: "openai-completions", baseUrl: "http://localhost:1234" },
    custom: { api: "openai-completions", baseUrl: "" },
  };

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    return {};
  }

  // Build models array from catalog — exclude deprecated models
  const catalogModels = (MODELS_CATALOG[provider]?.models ?? []).filter((m) => !m.deprecated);
  const models = catalogModels.map(
    (m: {
      id: string;
      name: string;
      contextWindow?: number;
      maxOutput?: number;
      pricing?: { input: number; output: number };
      reasoning?: boolean;
    }) => ({
      id: m.id,
      name: m.name,
      ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
      ...(m.maxOutput ? { maxTokens: m.maxOutput } : {}),
      ...(m.pricing ? { cost: { input: m.pricing.input, output: m.pricing.output } } : {}),
      ...(m.reasoning ? { reasoning: true } : {}),
      input: ["text"],
    }),
  );

  const providerEntry: Record<string, unknown> = {
    api: cfg.api,
    baseUrl: creds.baseUrl || cfg.baseUrl,
    models,
  };

  // Add auth
  if (creds.apiKey) {
    providerEntry.apiKey = creds.apiKey;
  }

  return { models: { providers: { [provider]: providerEntry } } };
}

// --- Status helper ---

export function getProviderStatus(
  providerId: string,
  configuredProviders: Set<string>,
  detectedProviders: Set<string>,
  preferredProvider: string | null,
): "preferred" | "configured" | "detected" | "available" {
  if (providerId === preferredProvider && configuredProviders.has(providerId)) {
    return "preferred";
  }
  if (configuredProviders.has(providerId)) {
    return "configured";
  }
  if (detectedProviders.has(providerId)) {
    return "detected";
  }
  return "available";
}
