import {
  type OpenClawConfig,
  readConfigFileSnapshotForWrite,
  resolveConfigSnapshotHash,
  writeConfigFile,
} from "../config/config.js";
import type { ModelDefinitionConfig, ModelProviderConfig } from "../config/types.models.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  buildHuggingfaceProvider,
  buildKilocodeProviderWithDiscovery,
  buildOllamaProvider,
  buildVeniceProvider,
  buildVercelAiGatewayProvider,
  buildVllmProvider,
} from "./models-config.providers.discovery.js";

const log = createSubsystemLogger("agents/refresh-providers");

export const DISCOVERABLE_PROVIDERS = [
  "ollama",
  "vllm",
  "venice",
  "vercel-ai-gateway",
  "huggingface",
  "kilocode",
] as const;

export type DiscoverableProvider = (typeof DISCOVERABLE_PROVIDERS)[number];

function isDiscoverable(key: string): key is DiscoverableProvider {
  return (DISCOVERABLE_PROVIDERS as readonly string[]).includes(key);
}

/**
 * Per-provider summary of a single refresh attempt.
 */
export type ProviderRefreshSummary =
  | {
      provider: DiscoverableProvider;
      ok: true;
      oldCount: number;
      models: ModelDefinitionConfig[];
      baseUrl?: string;
    }
  | {
      provider: DiscoverableProvider;
      ok: false;
      code: "unreachable" | "discovery-failed";
      baseUrl?: string;
      error?: string;
    };

export type RefreshProvidersResult =
  | {
      ok: true;
      summaries: ProviderRefreshSummary[];
      refreshedCount: number;
      failedCount: number;
      writtenCount: number;
      allowlistActive: boolean;
    }
  | { ok: false; code: "config-conflict" }
  | { ok: false; code: "io-error"; error: string };

function asPlainSecret(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function discoverFor(
  provider: DiscoverableProvider,
  existing: Partial<ModelProviderConfig>,
): Promise<ModelProviderConfig> {
  switch (provider) {
    case "ollama":
      return await buildOllamaProvider(existing.baseUrl, { quiet: true });
    case "vllm":
      return await buildVllmProvider({
        baseUrl: existing.baseUrl,
        apiKey: asPlainSecret(existing.apiKey),
      });
    case "venice":
      return await buildVeniceProvider();
    case "vercel-ai-gateway":
      return await buildVercelAiGatewayProvider();
    case "huggingface":
      return await buildHuggingfaceProvider(asPlainSecret(existing.apiKey));
    case "kilocode":
      return await buildKilocodeProviderWithDiscovery();
  }
}

/**
 * Re-runs live discovery against every configured provider that supports it.
 * Preserves `apiKey` / `headers` / `baseUrl` (when the user has set a custom
 * one) on each provider entry. A single hash-checked config write applies all
 * successful refreshes atomically; partial failures are reported in the
 * per-provider summary array but don't roll back the whole batch.
 */
export async function refreshProviders(
  cfg: OpenClawConfig,
  filter?: readonly string[],
): Promise<RefreshProvidersResult> {
  const before = await readConfigFileSnapshotForWrite();
  const hashBefore = resolveConfigSnapshotHash(before.snapshot);

  const providers = before.snapshot.config.models?.providers ?? {};
  const configuredKeys = Object.keys(providers);

  const requested = filter && filter.length > 0 ? filter : configuredKeys;
  const targets = requested.filter((k): k is DiscoverableProvider => {
    if (!isDiscoverable(k)) {
      return false;
    }
    return configuredKeys.includes(k);
  });

  const summaries: ProviderRefreshSummary[] = [];
  const updates: Record<string, ModelProviderConfig> = {};

  for (const provider of targets) {
    const existing = (providers[provider] ?? {}) as Partial<ModelProviderConfig>;
    const oldCount = Array.isArray(existing.models) ? existing.models.length : 0;

    let fresh: ModelProviderConfig;
    try {
      fresh = await discoverFor(provider, existing);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`refresh provider=${provider} discovery failed: ${message}`);
      summaries.push({
        provider,
        ok: false,
        code: "discovery-failed",
        error: message,
        baseUrl: existing.baseUrl,
      });
      continue;
    }

    if (fresh.models.length === 0 && oldCount > 0) {
      log.warn(
        `refresh provider=${provider} returned 0 models but existing had ${oldCount} — keeping existing`,
      );
      summaries.push({
        provider,
        ok: false,
        code: "unreachable",
        baseUrl: fresh.baseUrl ?? existing.baseUrl,
      });
      continue;
    }

    summaries.push({
      provider,
      ok: true,
      oldCount,
      models: fresh.models,
      baseUrl: fresh.baseUrl ?? existing.baseUrl,
    });
    updates[provider] = {
      ...existing,
      baseUrl: fresh.baseUrl ?? existing.baseUrl ?? "",
      api: fresh.api ?? existing.api,
      models: fresh.models,
    };
  }

  const allowlistActive = Object.keys(cfg.agents?.defaults?.models ?? {}).length > 0;
  const failedCount = summaries.filter((s) => !s.ok).length;
  const refreshedCount = summaries.filter((s) => s.ok).length;

  if (Object.keys(updates).length === 0) {
    // Nothing to write — either no discoverable providers configured or all failed.
    return {
      ok: true,
      summaries,
      refreshedCount,
      failedCount,
      writtenCount: 0,
      allowlistActive,
    };
  }

  const after = await readConfigFileSnapshotForWrite();
  const hashAfter = resolveConfigSnapshotHash(after.snapshot);
  if (hashBefore && hashAfter && hashBefore !== hashAfter) {
    log.warn("refresh aborted: config changed during discovery");
    return { ok: false, code: "config-conflict" };
  }

  const nextCfg: OpenClawConfig = {
    ...cfg,
    models: {
      ...cfg.models,
      providers: { ...providers, ...updates },
    },
  };

  try {
    await writeConfigFile(nextCfg, before.writeOptions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`refresh write failed: ${message}`);
    return { ok: false, code: "io-error", error: message };
  }

  log.info(
    `refresh ok: refreshed=${refreshedCount} failed=${failedCount} written=${Object.keys(updates).length}`,
  );

  return {
    ok: true,
    summaries,
    refreshedCount,
    failedCount,
    writtenCount: Object.keys(updates).length,
    allowlistActive,
  };
}
