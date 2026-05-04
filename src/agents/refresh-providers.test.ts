import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelDefinitionConfig, ModelProviderConfig } from "../config/types.models.js";

const mocks = vi.hoisted(() => ({
  readConfigFileSnapshotForWrite: vi.fn(),
  resolveConfigSnapshotHash: vi.fn(),
  writeConfigFile: vi.fn(async () => undefined),
  buildOllamaProvider: vi.fn(),
  buildVllmProvider: vi.fn(),
  buildVeniceProvider: vi.fn(),
  buildVercelAiGatewayProvider: vi.fn(),
  buildHuggingfaceProvider: vi.fn(),
  buildKilocodeProviderWithDiscovery: vi.fn(),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    readConfigFileSnapshotForWrite: mocks.readConfigFileSnapshotForWrite,
    resolveConfigSnapshotHash: mocks.resolveConfigSnapshotHash,
    writeConfigFile: mocks.writeConfigFile,
  };
});

vi.mock("./models-config.providers.discovery.js", () => ({
  buildOllamaProvider: mocks.buildOllamaProvider,
  buildVllmProvider: mocks.buildVllmProvider,
  buildVeniceProvider: mocks.buildVeniceProvider,
  buildVercelAiGatewayProvider: mocks.buildVercelAiGatewayProvider,
  buildHuggingfaceProvider: mocks.buildHuggingfaceProvider,
  buildKilocodeProviderWithDiscovery: mocks.buildKilocodeProviderWithDiscovery,
}));

const mockLogger = vi.hoisted(() => {
  const logger: Record<string, unknown> = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  logger.child = () => logger;
  return logger;
});
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => mockLogger,
}));

const { refreshProviders } = await import("./refresh-providers.js");

const OLLAMA_BASE = "http://localhost:11434";

function makeFreshModel(id: string): ModelDefinitionConfig {
  return {
    id,
    name: id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 2048,
  };
}

function makeSnapshot(
  providers: Record<string, Partial<ModelProviderConfig>>,
  hash: string,
): {
  snapshot: { config: OpenClawConfig; raw: string; hash: string };
  writeOptions: { envSnapshotForRestore: undefined; expectedConfigPath: string };
} {
  const cfg: OpenClawConfig = {
    models: { providers: providers as Record<string, ModelProviderConfig> },
  } as unknown as OpenClawConfig;
  return {
    snapshot: { config: cfg, raw: JSON.stringify(cfg), hash },
    writeOptions: { envSnapshotForRestore: undefined, expectedConfigPath: "/tmp/cfg.json" },
  };
}

function setSnapshots(
  before: ReturnType<typeof makeSnapshot>,
  after?: ReturnType<typeof makeSnapshot>,
): void {
  mocks.readConfigFileSnapshotForWrite
    .mockResolvedValueOnce(before)
    .mockResolvedValueOnce(after ?? before);
  mocks.resolveConfigSnapshotHash.mockImplementation(
    (snap: { hash?: string }) => snap.hash ?? null,
  );
}

describe("refreshProviders", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.writeConfigFile.mockResolvedValue(undefined);
    mocks.resolveConfigSnapshotHash.mockImplementation(
      (snap: { hash?: string }) => snap.hash ?? null,
    );
  });

  it("refreshes a single configured ollama provider, preserving apiKey/headers", async () => {
    const existing: Partial<ModelProviderConfig> = {
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      apiKey: "ollama-local-marker",
      headers: { "X-Custom": "yes" },
      models: [makeFreshModel("old-1"), makeFreshModel("old-2")],
    };
    setSnapshots(makeSnapshot({ ollama: existing }, "h1"));
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("gemma4:26b"), makeFreshModel("qwen3:8b")],
    });

    const cfg = {
      models: { providers: { ollama: existing as ModelProviderConfig } },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refreshedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.writtenCount).toBe(1);
      expect(result.summaries).toHaveLength(1);
      const summary = result.summaries[0];
      expect(summary?.provider).toBe("ollama");
      expect(summary?.ok).toBe(true);
      if (summary?.ok) {
        expect(summary.oldCount).toBe(2);
        expect(summary.models.map((m) => m.id)).toEqual(["gemma4:26b", "qwen3:8b"]);
      }
    }

    expect(mocks.writeConfigFile).toHaveBeenCalledTimes(1);
    const calls = mocks.writeConfigFile.mock.calls as unknown as Array<[OpenClawConfig, unknown]>;
    const writtenOllama = calls[0]?.[0]?.models?.providers?.ollama;
    expect(writtenOllama?.apiKey).toBe("ollama-local-marker");
    expect(writtenOllama?.headers).toEqual({ "X-Custom": "yes" });
    expect(writtenOllama?.models).toHaveLength(2);
  });

  it("refreshes multiple discoverable providers in one batch with one config write", async () => {
    const existingOllama: Partial<ModelProviderConfig> = {
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [],
    };
    const existingVenice: Partial<ModelProviderConfig> = {
      baseUrl: "https://api.venice.ai/v1",
      api: "openai-completions",
      apiKey: "sk-venice-secret",
      models: [],
    };
    setSnapshots(makeSnapshot({ ollama: existingOllama, venice: existingVenice }, "h1"));
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("gemma4:26b")],
    });
    mocks.buildVeniceProvider.mockResolvedValue({
      baseUrl: "https://api.venice.ai/v1",
      api: "openai-completions",
      models: [makeFreshModel("llama-3-405b"), makeFreshModel("dolphin-3")],
    });

    const cfg = {
      models: {
        providers: {
          ollama: existingOllama as ModelProviderConfig,
          venice: existingVenice as ModelProviderConfig,
        },
      },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refreshedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.writtenCount).toBe(2);
      expect(result.summaries.map((s) => s.provider).toSorted()).toEqual(["ollama", "venice"]);
    }
    expect(mocks.writeConfigFile).toHaveBeenCalledTimes(1);
    const calls = mocks.writeConfigFile.mock.calls as unknown as Array<[OpenClawConfig, unknown]>;
    const writtenProviders = calls[0]?.[0]?.models?.providers;
    expect(writtenProviders?.ollama?.models).toHaveLength(1);
    expect(writtenProviders?.venice?.models).toHaveLength(2);
    expect(writtenProviders?.venice?.apiKey).toBe("sk-venice-secret");
  });

  it("skips non-discoverable providers (anthropic etc.) without erroring", async () => {
    const existingAnthropic: Partial<ModelProviderConfig> = {
      baseUrl: "https://api.anthropic.com",
      apiKey: "anthropic-key",
      models: [makeFreshModel("claude-opus-4-5")],
    };
    setSnapshots(makeSnapshot({ anthropic: existingAnthropic }, "h1"));

    const cfg = {
      models: { providers: { anthropic: existingAnthropic as ModelProviderConfig } },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refreshedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.writtenCount).toBe(0);
      expect(result.summaries).toEqual([]);
    }
    expect(mocks.writeConfigFile).not.toHaveBeenCalled();
  });

  it("reports unreachable provider when discovery returns [] and existing was populated, no write", async () => {
    const existing: Partial<ModelProviderConfig> = {
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("a"), makeFreshModel("b")],
    };
    setSnapshots(makeSnapshot({ ollama: existing }, "h1"));
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [],
    });

    const cfg = {
      models: { providers: { ollama: existing as ModelProviderConfig } },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refreshedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.writtenCount).toBe(0);
      const summary = result.summaries[0];
      if (summary && !summary.ok) {
        expect(summary.code).toBe("unreachable");
        expect(summary.baseUrl).toBe(OLLAMA_BASE);
      }
    }
    expect(mocks.writeConfigFile).not.toHaveBeenCalled();
  });

  it("aborts on config-conflict when hash differs between snapshots", async () => {
    const existing: Partial<ModelProviderConfig> = {
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("old-1")],
    };
    setSnapshots(
      makeSnapshot({ ollama: existing }, "h1"),
      makeSnapshot({ ollama: existing }, "h2"),
    );
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("gemma4:26b")],
    });

    const cfg = {
      models: { providers: { ollama: existing as ModelProviderConfig } },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("config-conflict");
    }
    expect(mocks.writeConfigFile).not.toHaveBeenCalled();
  });

  it("returns io-error when writeConfigFile throws", async () => {
    const existing: Partial<ModelProviderConfig> = { baseUrl: OLLAMA_BASE, api: "ollama" };
    setSnapshots(makeSnapshot({ ollama: existing }, "h1"));
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("a")],
    });
    mocks.writeConfigFile.mockRejectedValueOnce(new Error("disk full"));

    const cfg = {
      models: { providers: { ollama: existing as ModelProviderConfig } },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("io-error");
      if (result.code === "io-error") {
        expect(result.error).toBe("disk full");
      }
    }
  });

  it("flags allowlistActive when agents.defaults.models is non-empty", async () => {
    const existing: Partial<ModelProviderConfig> = { baseUrl: OLLAMA_BASE, api: "ollama" };
    setSnapshots(makeSnapshot({ ollama: existing }, "h1"));
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("gemma4:26b")],
    });

    const cfg = {
      agents: { defaults: { models: { "openai/gpt-4o-mini": {} } } },
      models: { providers: { ollama: existing as ModelProviderConfig } },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allowlistActive).toBe(true);
    }
  });

  it("filters to a subset when called with a filter array", async () => {
    const ollama: Partial<ModelProviderConfig> = { baseUrl: OLLAMA_BASE, api: "ollama" };
    const venice: Partial<ModelProviderConfig> = { baseUrl: "x", api: "openai-completions" };
    setSnapshots(makeSnapshot({ ollama, venice }, "h1"));
    mocks.buildOllamaProvider.mockResolvedValue({
      baseUrl: OLLAMA_BASE,
      api: "ollama",
      models: [makeFreshModel("gemma4:26b")],
    });

    const cfg = {
      models: {
        providers: {
          ollama: ollama as ModelProviderConfig,
          venice: venice as ModelProviderConfig,
        },
      },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg, ["ollama"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0]?.provider).toBe("ollama");
    }
    expect(mocks.buildVeniceProvider).not.toHaveBeenCalled();
  });

  it("captures a discovery throw as discovery-failed without aborting other providers", async () => {
    const ollama: Partial<ModelProviderConfig> = { baseUrl: OLLAMA_BASE, api: "ollama" };
    const venice: Partial<ModelProviderConfig> = { baseUrl: "x", api: "openai-completions" };
    setSnapshots(makeSnapshot({ ollama, venice }, "h1"));
    mocks.buildOllamaProvider.mockRejectedValueOnce(new Error("network down"));
    mocks.buildVeniceProvider.mockResolvedValue({
      baseUrl: "x",
      api: "openai-completions",
      models: [makeFreshModel("llama-3-405b")],
    });

    const cfg = {
      models: {
        providers: {
          ollama: ollama as ModelProviderConfig,
          venice: venice as ModelProviderConfig,
        },
      },
    } as unknown as OpenClawConfig;
    const result = await refreshProviders(cfg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refreshedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      const failed = result.summaries.find((s) => !s.ok);
      if (failed && !failed.ok) {
        expect(failed.code).toBe("discovery-failed");
        expect(failed.error).toBe("network down");
      }
    }
    expect(mocks.writeConfigFile).toHaveBeenCalledTimes(1);
  });
});
