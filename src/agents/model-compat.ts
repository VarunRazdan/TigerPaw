import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

/**
 * Returns true only for endpoints that are confirmed to be native OpenAI
 * infrastructure and therefore accept the `developer` message role.
 * Azure OpenAI uses the Chat Completions API and does NOT accept `developer`.
 * All other openai-completions backends (proxies, Qwen, GLM, DeepSeek, etc.)
 * only support the standard `system` role.
 */
function isOpenAINativeEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.openai.com";
  } catch {
    return false;
  }
}

function isAnthropicMessagesModel(model: Model<Api>): model is Model<"anthropic-messages"> {
  return model.api === "anthropic-messages";
}

function isGoogleGenerativeAiModel(model: Model<Api>): model is Model<"google-generative-ai"> {
  return model.api === "google-generative-ai";
}

/**
 * pi-ai's Google provider sets `apiVersion = ""` when a custom `baseUrl` is
 * provided, assuming the version path is already included.  If the user
 * configures just the bare domain (e.g. "https://generativelanguage.googleapis.com")
 * the resulting URL omits `/v1beta`, causing a 404.
 *
 * Append `/v1beta` when the path is empty or just `/`.
 */
function normalizeGoogleBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.pathname === "/" || url.pathname === "") {
      return baseUrl.replace(/\/+$/, "") + "/v1beta";
    }
  } catch {
    // Not a valid URL — return as-is.
  }
  return baseUrl;
}

/**
 * pi-ai constructs the Anthropic API endpoint as `${baseUrl}/v1/messages`.
 * If a user configures `baseUrl` with a trailing `/v1` (e.g. the previously
 * recommended format "https://api.anthropic.com/v1"), the resulting URL
 * becomes "…/v1/v1/messages" which the Anthropic API rejects with a 404.
 *
 * Strip a single trailing `/v1` (with optional trailing slash) from the
 * baseUrl for anthropic-messages models so users with either format work.
 */
function normalizeAnthropicBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}
export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  const baseUrl = model.baseUrl ?? "";

  // Normalise anthropic-messages baseUrl: strip trailing /v1 that users may
  // have included in their config. pi-ai appends /v1/messages itself.
  if (isAnthropicMessagesModel(model) && baseUrl) {
    const normalised = normalizeAnthropicBaseUrl(baseUrl);
    if (normalised !== baseUrl) {
      return { ...model, baseUrl: normalised } as Model<"anthropic-messages">;
    }
  }

  // Normalise google-generative-ai baseUrl: append /v1beta when only the bare
  // domain is configured.  pi-ai sets apiVersion="" when baseUrl is present.
  if (isGoogleGenerativeAiModel(model) && baseUrl) {
    const normalised = normalizeGoogleBaseUrl(baseUrl);
    if (normalised !== baseUrl) {
      return { ...model, baseUrl: normalised } as Model<"google-generative-ai">;
    }
  }

  if (!isOpenAiCompletionsModel(model)) {
    return model;
  }

  // The `developer` role and stream usage chunks are OpenAI-native behaviors.
  // Many OpenAI-compatible backends reject `developer` and/or emit usage-only
  // chunks that break strict parsers expecting choices[0]. For non-native
  // openai-completions endpoints, force both compat flags off.
  const compat = model.compat ?? undefined;
  // When baseUrl is empty the pi-ai library defaults to api.openai.com, so
  // leave compat unchanged and let default native behavior apply.
  // Note: explicit true values are intentionally overridden for non-native
  // endpoints for safety.
  const needsForce = baseUrl ? !isOpenAINativeEndpoint(baseUrl) : false;
  if (!needsForce) {
    return model;
  }
  if (compat?.supportsDeveloperRole === false && compat?.supportsUsageInStreaming === false) {
    return model;
  }

  // Return a new object — do not mutate the caller's model reference.
  return {
    ...model,
    compat: compat
      ? { ...compat, supportsDeveloperRole: false, supportsUsageInStreaming: false }
      : { supportsDeveloperRole: false, supportsUsageInStreaming: false },
  } as typeof model;
}
