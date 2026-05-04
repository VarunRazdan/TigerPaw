import { resolveAgentDir, resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveModelAuthLabel } from "../../agents/model-auth-label.js";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import {
  buildAllowedModelSet,
  buildModelAliasIndex,
  normalizeProviderId,
  resolveDefaultModelForAgent,
  resolveModelRefFromString,
} from "../../agents/model-selection.js";
import { refreshProviders } from "../../agents/refresh-providers.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import {
  buildModelsKeyboard,
  buildProviderKeyboard,
  calculateTotalPages,
  getModelsPageSize,
  type ProviderInfo,
} from "../../telegram/model-buttons.js";
import type { ReplyPayload } from "../types.js";
import { rejectUnauthorizedCommand } from "./command-gates.js";
import type { CommandHandler } from "./commands-types.js";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

export type ModelsProviderData = {
  byProvider: Map<string, Set<string>>;
  providers: string[];
  resolvedDefault: { provider: string; model: string };
};

/**
 * Build provider/model data from config and catalog.
 * Exported for reuse by callback handlers.
 */
export async function buildModelsProviderData(
  cfg: OpenClawConfig,
  agentId?: string,
): Promise<ModelsProviderData> {
  const resolvedDefault = resolveDefaultModelForAgent({
    cfg,
    agentId,
  });

  const catalog = await loadModelCatalog({ config: cfg });
  const allowed = buildAllowedModelSet({
    cfg,
    catalog,
    defaultProvider: resolvedDefault.provider,
    defaultModel: resolvedDefault.model,
  });

  const aliasIndex = buildModelAliasIndex({
    cfg,
    defaultProvider: resolvedDefault.provider,
  });

  const byProvider = new Map<string, Set<string>>();
  const add = (p: string, m: string) => {
    const key = normalizeProviderId(p);
    const set = byProvider.get(key) ?? new Set<string>();
    set.add(m);
    byProvider.set(key, set);
  };

  const addRawModelRef = (raw?: string) => {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return;
    }
    const resolved = resolveModelRefFromString({
      raw: trimmed,
      defaultProvider: resolvedDefault.provider,
      aliasIndex,
    });
    if (!resolved) {
      return;
    }
    add(resolved.ref.provider, resolved.ref.model);
  };

  const addModelConfigEntries = () => {
    const modelConfig = cfg.agents?.defaults?.model;
    if (typeof modelConfig === "string") {
      addRawModelRef(modelConfig);
    } else if (modelConfig && typeof modelConfig === "object") {
      addRawModelRef(modelConfig.primary);
      for (const fallback of modelConfig.fallbacks ?? []) {
        addRawModelRef(fallback);
      }
    }

    const imageConfig = cfg.agents?.defaults?.imageModel;
    if (typeof imageConfig === "string") {
      addRawModelRef(imageConfig);
    } else if (imageConfig && typeof imageConfig === "object") {
      addRawModelRef(imageConfig.primary);
      for (const fallback of imageConfig.fallbacks ?? []) {
        addRawModelRef(fallback);
      }
    }
  };

  for (const entry of allowed.allowedCatalog) {
    add(entry.provider, entry.id);
  }

  // Include config-only allowlist keys that aren't in the curated catalog.
  for (const raw of Object.keys(cfg.agents?.defaults?.models ?? {})) {
    addRawModelRef(raw);
  }

  // Ensure configured defaults/fallbacks/image models show up even when the
  // curated catalog doesn't know about them (custom providers, dev builds, etc.).
  add(resolvedDefault.provider, resolvedDefault.model);
  addModelConfigEntries();

  const providers = [...byProvider.keys()].toSorted();

  return { byProvider, providers, resolvedDefault };
}

function formatProviderLine(params: { provider: string; count: number }): string {
  return `- ${params.provider} (${params.count})`;
}

function parseModelsArgs(raw: string): {
  provider?: string;
  page: number;
  pageSize: number;
  all: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { page: 1, pageSize: PAGE_SIZE_DEFAULT, all: false };
  }

  const tokens = trimmed.split(/\s+/g).filter(Boolean);
  const provider = tokens[0]?.trim();

  let page = 1;
  let all = false;
  for (const token of tokens.slice(1)) {
    const lower = token.toLowerCase();
    if (lower === "all" || lower === "--all") {
      all = true;
      continue;
    }
    if (lower.startsWith("page=")) {
      const value = Number.parseInt(lower.slice("page=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        page = value;
      }
      continue;
    }
    if (/^[0-9]+$/.test(lower)) {
      const value = Number.parseInt(lower, 10);
      if (Number.isFinite(value) && value > 0) {
        page = value;
      }
    }
  }

  let pageSize = PAGE_SIZE_DEFAULT;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith("limit=") || lower.startsWith("size=")) {
      const rawValue = lower.slice(lower.indexOf("=") + 1);
      const value = Number.parseInt(rawValue, 10);
      if (Number.isFinite(value) && value > 0) {
        pageSize = Math.min(PAGE_SIZE_MAX, value);
      }
    }
  }

  return {
    provider: provider ? normalizeProviderId(provider) : undefined,
    page,
    pageSize,
    all,
  };
}

function resolveProviderLabel(params: {
  provider: string;
  cfg: OpenClawConfig;
  agentDir?: string;
  sessionEntry?: SessionEntry;
}): string {
  const authLabel = resolveModelAuthLabel({
    provider: params.provider,
    cfg: params.cfg,
    sessionEntry: params.sessionEntry,
    agentDir: params.agentDir,
  });
  if (!authLabel || authLabel === "unknown") {
    return params.provider;
  }
  return `${params.provider} · 🔑 ${authLabel}`;
}

export function formatModelsAvailableHeader(params: {
  provider: string;
  total: number;
  cfg: OpenClawConfig;
  agentDir?: string;
  sessionEntry?: SessionEntry;
}): string {
  const providerLabel = resolveProviderLabel({
    provider: params.provider,
    cfg: params.cfg,
    agentDir: params.agentDir,
    sessionEntry: params.sessionEntry,
  });
  return `Models (${providerLabel}) — ${params.total} available`;
}

export async function resolveModelsCommandReply(params: {
  cfg: OpenClawConfig;
  commandBodyNormalized: string;
  surface?: string;
  currentModel?: string;
  agentId?: string;
  agentDir?: string;
  sessionEntry?: SessionEntry;
}): Promise<ReplyPayload | null> {
  const body = params.commandBodyNormalized.trim();
  if (!body.startsWith("/models")) {
    return null;
  }

  const argText = body.replace(/^\/models\b/i, "").trim();

  // `refresh` is a subcommand, not a provider — branch before parseModelsArgs
  // would otherwise emit "Unknown provider: refresh".
  if (/^refresh(\b|$)/i.test(argText)) {
    return await handleModelsRefresh({ argText, cfg: params.cfg });
  }

  // `/models list ...` flattens every configured provider's models into a
  // single list so users can scan leaf model IDs without memorizing them.
  // `/models <provider> list` is handled by parseModelsArgs silently
  // ignoring the trailing "list" token.
  if (/^list(\b|$)/i.test(argText)) {
    return await handleModelsListAll({
      argText: argText.replace(/^list\b\s*/i, ""),
      cfg: params.cfg,
      surface: params.surface,
      currentModel: params.currentModel,
      agentId: params.agentId,
      agentDir: params.agentDir,
      sessionEntry: params.sessionEntry,
    });
  }

  const { provider, page, pageSize, all } = parseModelsArgs(argText);

  const { byProvider, providers } = await buildModelsProviderData(params.cfg, params.agentId);
  const isTelegram = params.surface === "telegram";

  // Provider list (no provider specified)
  if (!provider) {
    // For Telegram: show buttons if there are providers
    if (isTelegram && providers.length > 0) {
      const providerInfos: ProviderInfo[] = providers.map((p) => ({
        id: p,
        count: byProvider.get(p)?.size ?? 0,
      }));
      const buttons = buildProviderKeyboard(providerInfos);
      const text = "Select a provider:";
      return {
        text,
        channelData: { telegram: { buttons } },
      };
    }

    // Text fallback for non-Telegram surfaces
    const lines: string[] = [
      "Providers:",
      ...providers.map((p) =>
        formatProviderLine({ provider: p, count: byProvider.get(p)?.size ?? 0 }),
      ),
      "",
      "Use: /models <provider>",
      "Switch: /model <provider/model>",
    ];
    return { text: lines.join("\n") };
  }

  if (!byProvider.has(provider)) {
    const lines: string[] = [
      `Unknown provider: ${provider}`,
      "",
      "Available providers:",
      ...providers.map((p) => `- ${p}`),
      "",
      "Use: /models <provider>",
    ];
    return { text: lines.join("\n") };
  }

  const models = [...(byProvider.get(provider) ?? new Set<string>())].toSorted();
  const total = models.length;
  const providerLabel = resolveProviderLabel({
    provider,
    cfg: params.cfg,
    agentDir: params.agentDir,
    sessionEntry: params.sessionEntry,
  });

  if (total === 0) {
    const lines: string[] = [
      `Models (${providerLabel}) — none`,
      "",
      "Browse: /models",
      "Switch: /model <provider/model>",
    ];
    return { text: lines.join("\n") };
  }

  // For Telegram: use button-based model list with inline keyboard pagination
  if (isTelegram) {
    const telegramPageSize = getModelsPageSize();
    const totalPages = calculateTotalPages(total, telegramPageSize);
    const safePage = Math.max(1, Math.min(page, totalPages));

    const buttons = buildModelsKeyboard({
      provider,
      models,
      currentModel: params.currentModel,
      currentPage: safePage,
      totalPages,
      pageSize: telegramPageSize,
    });

    const text = formatModelsAvailableHeader({
      provider,
      total,
      cfg: params.cfg,
      agentDir: params.agentDir,
      sessionEntry: params.sessionEntry,
    });
    return {
      text,
      channelData: { telegram: { buttons } },
    };
  }

  // Text fallback for non-Telegram surfaces
  const effectivePageSize = all ? total : pageSize;
  const pageCount = effectivePageSize > 0 ? Math.ceil(total / effectivePageSize) : 1;
  const safePage = all ? 1 : Math.max(1, Math.min(page, pageCount));

  if (!all && page !== safePage) {
    const lines: string[] = [
      `Page out of range: ${page} (valid: 1-${pageCount})`,
      "",
      `Try: /models ${provider} ${safePage}`,
      `All: /models ${provider} all`,
    ];
    return { text: lines.join("\n") };
  }

  const startIndex = (safePage - 1) * effectivePageSize;
  const endIndexExclusive = Math.min(total, startIndex + effectivePageSize);
  const pageModels = models.slice(startIndex, endIndexExclusive);

  const header = `Models (${providerLabel}) — showing ${startIndex + 1}-${endIndexExclusive} of ${total} (page ${safePage}/${pageCount})`;

  const lines: string[] = [header];
  for (const id of pageModels) {
    const ref = `${provider}/${id}`;
    lines.push(params.currentModel === ref ? `* ${ref} (active)` : `- ${ref}`);
  }

  lines.push("", "Switch: /model <provider/model>");
  if (!all && safePage < pageCount) {
    lines.push(`More: /models ${provider} ${safePage + 1}`);
  }
  if (!all) {
    lines.push(`All: /models ${provider} all`);
  }

  const payload: ReplyPayload = { text: lines.join("\n") };
  return payload;
}

const REFRESH_INLINE_LIMIT = 20;

async function handleModelsRefresh(params: {
  argText: string;
  cfg: OpenClawConfig;
}): Promise<ReplyPayload> {
  const tokens = params.argText.trim().split(/\s+/g).filter(Boolean);
  // tokens[0] is "refresh"; tokens[1] (if present) is an optional provider filter.
  const filter = tokens[1] ? [tokens[1].toLowerCase()] : undefined;

  const result = await refreshProviders(params.cfg, filter);

  if (!result.ok) {
    if (result.code === "config-conflict") {
      return { text: "⚠️ Config changed during refresh — please retry /models refresh." };
    }
    return { text: `❌ Failed to write config: ${result.error}` };
  }

  if (result.summaries.length === 0) {
    return {
      text: filter
        ? `No live discovery for "${filter[0]}" — only ollama, vllm, venice, vercel-ai-gateway, huggingface, kilocode support refresh.`
        : "No discoverable providers configured. Static catalog providers (anthropic, openai, …) are always up-to-date.",
    };
  }

  const lines: string[] = [
    `🔄 Refresh complete (${result.refreshedCount} provider${result.refreshedCount === 1 ? "" : "s"} refreshed${
      result.failedCount ? `, ${result.failedCount} failed` : ""
    })`,
  ];

  for (const summary of result.summaries) {
    lines.push("");
    if (!summary.ok) {
      if (summary.code === "unreachable") {
        lines.push(
          `❌ ${summary.provider}: unreachable${summary.baseUrl ? ` at ${summary.baseUrl}` : ""}`,
        );
      } else {
        lines.push(
          `❌ ${summary.provider}: discovery failed${summary.error ? ` (${summary.error})` : ""}`,
        );
      }
      continue;
    }
    const newCount = summary.models.length;
    lines.push(`${summary.provider} (was ${summary.oldCount} → now ${newCount}):`);
    if (newCount === 0) {
      lines.push(`  (no models discovered)`);
      continue;
    }
    const shown = summary.models.slice(0, REFRESH_INLINE_LIMIT);
    for (const model of shown) {
      lines.push(`- ${summary.provider}/${model.id}`);
    }
    if (newCount > REFRESH_INLINE_LIMIT) {
      lines.push(
        `  …and ${newCount - REFRESH_INLINE_LIMIT} more — /models ${summary.provider} list`,
      );
    }
  }

  if (result.refreshedCount > 0) {
    lines.push("", "Switch: /model <provider/model>");
  }

  if (result.allowlistActive) {
    lines.push(
      "",
      "⚠️ You have an explicit allowlist (agents.defaults.models). Refreshed",
      "tags won't appear in /models <provider> until you add them there. Use",
      "/model <provider/model> to switch directly for this session.",
    );
  }

  return { text: lines.join("\n") };
}

async function handleModelsListAll(params: {
  argText: string;
  cfg: OpenClawConfig;
  surface?: string;
  currentModel?: string;
  agentId?: string;
  agentDir?: string;
  sessionEntry?: SessionEntry;
}): Promise<ReplyPayload> {
  const { byProvider, providers } = await buildModelsProviderData(params.cfg, params.agentId);

  // Flatten provider/model into a sorted list of refs so users see leaf IDs.
  const collected: string[] = [];
  for (const provider of providers) {
    const models = [...(byProvider.get(provider) ?? new Set<string>())].toSorted();
    for (const id of models) {
      collected.push(`${provider}/${id}`);
    }
  }
  const allRefs = collected.toSorted();

  const total = allRefs.length;
  if (total === 0) {
    return {
      text:
        "No models in the catalog yet. Configure a provider in the AI Provider page,\n" +
        "or run /models refresh after starting your local Ollama / vLLM / etc.",
    };
  }

  const { page, pageSize, all } = parseModelsArgs(params.argText);
  const effectivePageSize = all ? total : pageSize;
  const pageCount = effectivePageSize > 0 ? Math.ceil(total / effectivePageSize) : 1;
  const safePage = all ? 1 : Math.max(1, Math.min(page, pageCount));

  if (!all && page !== safePage) {
    return {
      text: [
        `Page out of range: ${page} (valid: 1-${pageCount})`,
        "",
        `Try: /models list ${safePage}`,
        `All: /models list all`,
      ].join("\n"),
    };
  }

  const startIndex = (safePage - 1) * effectivePageSize;
  const endIndexExclusive = Math.min(total, startIndex + effectivePageSize);
  const pageRefs = allRefs.slice(startIndex, endIndexExclusive);

  const lines: string[] = [
    `All models — showing ${startIndex + 1}-${endIndexExclusive} of ${total} (page ${safePage}/${pageCount})`,
  ];
  for (const ref of pageRefs) {
    lines.push(params.currentModel === ref ? `* ${ref} (active)` : `- ${ref}`);
  }

  lines.push("", "Switch: /model <provider/model>");
  if (!all && safePage < pageCount) {
    lines.push(`More: /models list ${safePage + 1}`);
  }
  if (!all) {
    lines.push(`All: /models list all`);
  }
  lines.push("Filter to one provider: /models <provider> list");

  return { text: lines.join("\n") };
}

export const handleModelsCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const commandBodyNormalized = params.command.commandBodyNormalized.trim();
  if (!commandBodyNormalized.startsWith("/models")) {
    return null;
  }
  const unauthorized = rejectUnauthorizedCommand(params, "/models");
  if (unauthorized) {
    return unauthorized;
  }

  const modelsAgentId =
    params.agentId ??
    resolveSessionAgentId({
      sessionKey: params.sessionKey,
      config: params.cfg,
    });
  const modelsAgentDir = resolveAgentDir(params.cfg, modelsAgentId);

  const reply = await resolveModelsCommandReply({
    cfg: params.cfg,
    commandBodyNormalized,
    surface: params.ctx.Surface,
    currentModel: params.model ? `${params.provider}/${params.model}` : undefined,
    agentId: modelsAgentId,
    agentDir: modelsAgentDir,
    sessionEntry: params.sessionEntry,
  });
  if (!reply) {
    return null;
  }
  return { reply, shouldContinue: false };
};
