import { useState, useEffect, useCallback, useRef } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { saveConfigPatch } from "@/lib/save-config";
import { useAppStore } from "@/stores/app-store";
import { useIntegrationStore } from "@/stores/integration-store";
import { useMessageHubStore } from "@/stores/message-hub-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";
import { useWorkflowStore } from "@/stores/workflow-store";

export type ProviderTestStatus = "idle" | "testing" | "success" | "error";

export type StepId = "ai" | "messaging" | "trading" | "complete";

export type ProviderState = {
  credentials: Record<string, string>;
  testStatus: ProviderTestStatus;
  testDetail: string | null;
  testError: string | null;
  saved: boolean;
};

/** Legacy compat — the wizard component still references this type */
export type AiStepState = ProviderState & {
  selectedProvider: string | null;
};

function emptyProviderState(): ProviderState {
  return {
    credentials: {},
    testStatus: "idle",
    testDetail: null,
    testError: null,
    saved: false,
  };
}

type ConfigPatch = Record<string, unknown>;

export function buildAiConfigPatch(provider: string, creds: Record<string, string>): ConfigPatch {
  switch (provider) {
    case "anthropic":
      return {
        models: { providers: { anthropic: { type: "anthropic-messages", apiKey: creds.apiKey } } },
      };
    case "openai":
      return {
        models: { providers: { openai: { type: "openai-completions", apiKey: creds.apiKey } } },
      };
    case "google":
      return {
        models: { providers: { google: { type: "google-generative-ai", apiKey: creds.apiKey } } },
      };
    case "deepseek":
      return {
        models: {
          providers: {
            deepseek: {
              type: "openai-completions",
              baseUrl: "https://api.deepseek.com",
              apiKey: creds.apiKey,
            },
          },
        },
      };
    case "groq":
      return {
        models: {
          providers: {
            groq: {
              type: "openai-completions",
              baseUrl: "https://api.groq.com/openai",
              apiKey: creds.apiKey,
            },
          },
        },
      };
    case "mistral":
      return {
        models: {
          providers: {
            mistral: {
              type: "openai-completions",
              baseUrl: "https://api.mistral.ai",
              apiKey: creds.apiKey,
            },
          },
        },
      };
    case "xai":
      return {
        models: {
          providers: {
            xai: { type: "openai-completions", baseUrl: "https://api.x.ai", apiKey: creds.apiKey },
          },
        },
      };
    case "perplexity":
      return {
        models: {
          providers: {
            perplexity: {
              type: "openai-completions",
              baseUrl: "https://api.perplexity.ai",
              apiKey: creds.apiKey,
            },
          },
        },
      };
    case "ollama":
      return {
        models: {
          providers: {
            ollama: { type: "ollama", baseUrl: creds.baseUrl || "http://localhost:11434" },
          },
        },
      };
    case "lmstudio":
      return {
        models: {
          providers: {
            lmstudio: {
              type: "openai-completions",
              baseUrl: creds.baseUrl || "http://localhost:1234",
            },
          },
        },
      };
    case "custom":
      return {
        models: {
          providers: {
            custom: { type: "openai-completions", baseUrl: creds.baseUrl, apiKey: creds.apiKey },
          },
        },
      };
    default:
      return {};
  }
}

export function useOnboarding() {
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const channelStatuses = useAppStore((s) => s.channelStatuses);
  const platforms = useTradingStore((s) => s.platforms);
  const setDemoMode = useTradingStore((s) => s.setDemoMode);

  const [stepIndex, setStepIndex] = useState(0);

  // Per-provider state map
  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>({});
  // Which provider's form is currently expanded
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  // Which provider is preferred (first configured by default)
  const [preferredProvider, setPreferredProvider] = useState<string | null>(null);

  const [detectedProviders, setDetectedProviders] = useState<Record<string, boolean>>({});
  const [isDetecting, setIsDetecting] = useState(true);
  const [gatewayReachable, setGatewayReachable] = useState(true);

  // Derived
  const channelsConnected = channelStatuses?.filter((c) => c.connected).length ?? 0;
  const platformsConnected = Object.values(platforms).filter((p) => p.connected).length;
  const configuredProviders = Object.entries(providerStates)
    .filter(([, s]) => s.saved)
    .map(([id]) => id);
  const anyAiConfigured = configuredProviders.length > 0;

  // Helper: get or create provider state
  function getProviderState(id: string): ProviderState {
    return providerStates[id] ?? emptyProviderState();
  }

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto-detect local providers
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const detected: Record<string, boolean> = {};
      let reachable = false;

      const tests = [
        { id: "ollama", credentials: { baseUrl: "http://localhost:11434" } },
        { id: "lmstudio", credentials: { baseUrl: "http://localhost:1234" } },
      ];

      const results = await Promise.allSettled(
        tests.map(async (t) => {
          const res = await gatewayRpc<{ ok?: boolean }>("onboarding.test", {
            provider: t.id,
            credentials: t.credentials,
          });
          // Separate RPC success (gateway reachable) from test result (provider available)
          return { id: t.id, rpcOk: res.ok, testOk: res.ok && res.payload?.ok === true };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          // Only mark gateway as reachable if the RPC actually communicated
          if (r.value.rpcOk) {
            reachable = true;
          }
          detected[r.value.id] = r.value.testOk;
        }
      }

      if (!cancelled && mountedRef.current) {
        setDetectedProviders(detected);
        setGatewayReachable(reachable);
        setIsDetecting(false);

        // Pre-fill ollama base URL if detected
        if (detected.ollama) {
          setProviderStates((prev) => ({
            ...prev,
            ollama: {
              ...(prev.ollama ?? emptyProviderState()),
              credentials: {
                ...prev.ollama?.credentials,
                baseUrl: prev.ollama?.credentials?.baseUrl || "http://localhost:11434",
              },
            },
          }));
        }
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume: detect already-configured providers from config
  useEffect(() => {
    let cancelled = false;

    async function checkExisting() {
      try {
        const result = await gatewayRpc<{ raw?: string }>("config.get", {});
        if (cancelled || !result.ok || !result.payload?.raw) {
          return;
        }

        const config = JSON.parse(result.payload.raw) as Record<string, unknown>;
        const providers = (config.models as Record<string, unknown>)?.providers;
        if (providers && typeof providers === "object") {
          const ids = Object.keys(providers);
          if (ids.length > 0) {
            const states: Record<string, ProviderState> = {};
            for (const id of ids) {
              states[id] = {
                ...emptyProviderState(),
                saved: true,
                testStatus: "success",
                testDetail: "Previously configured",
              };
            }
            setProviderStates((prev) => ({ ...prev, ...states }));
            setPreferredProvider((prev) => prev ?? ids[0]);
          }
        }
      } catch (err) {
        console.warn("Failed to check existing config:", err);
      }
    }

    void checkExisting();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectAiProvider = useCallback((id: string) => {
    setActiveProvider((prev) => (prev === id ? null : id));
    // Ensure provider has a state entry
    setProviderStates((prev) => ({
      ...prev,
      [id]: prev[id] ?? emptyProviderState(),
    }));
  }, []);

  const setAiCredential = useCallback(
    (field: string, value: string) => {
      if (!activeProvider) {
        return;
      }
      const id = activeProvider;
      setProviderStates((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? emptyProviderState()),
          credentials: { ...prev[id]?.credentials, [field]: value },
        },
      }));
    },
    [activeProvider],
  );

  const testAiConnection = useCallback(async () => {
    if (!activeProvider) {
      return;
    }
    const id = activeProvider;
    const creds = providerStates[id]?.credentials ?? {};

    setProviderStates((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? emptyProviderState()),
        testStatus: "testing",
        testError: null,
        testDetail: null,
        credentials: creds,
        saved: prev[id]?.saved ?? false,
      },
    }));

    try {
      const result = await gatewayRpc<{ ok?: boolean; detail?: string; error?: string }>(
        "onboarding.test",
        { provider: id, credentials: creds },
      );

      if (!mountedRef.current) {
        return;
      }

      if (result.ok && result.payload?.ok) {
        // Save config for this provider
        const patch = buildAiConfigPatch(id, creds);
        let saved = true;
        if (Object.keys(patch).length > 0) {
          const saveResult = await saveConfigPatch(patch);
          saved = saveResult.ok;
        }

        setProviderStates((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? emptyProviderState()),
            credentials: creds,
            testStatus: "success",
            testDetail: result.payload.detail ?? (saved ? "Connected" : "Connected (save failed)"),
            saved,
          },
        }));

        // Auto-set as preferred if first
        setPreferredProvider((prev) => prev ?? id);
      } else {
        const errorMsg = result.ok
          ? (result.payload.error ?? "Connection failed")
          : (result.error ?? "Connection failed");
        setProviderStates((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? emptyProviderState()),
            credentials: creds,
            testStatus: "error",
            testError: errorMsg,
            saved: prev[id]?.saved ?? false,
          },
        }));
      }
    } catch {
      if (!mountedRef.current) {
        return;
      }
      setProviderStates((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? emptyProviderState()),
          credentials: creds,
          testStatus: "error",
          testError: "Gateway not reachable",
          saved: prev[id]?.saved ?? false,
        },
      }));
    }
  }, [activeProvider, providerStates]);

  const setPreferred = useCallback((id: string) => {
    setPreferredProvider(id);
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, 3));
  }, []);

  const prevStep = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const finishOnboarding = useCallback(
    (withDemoData: boolean) => {
      // Sync demo mode across ALL stores — not just trading
      setDemoMode(withDemoData);
      useNotificationStore.getState().setDemoMode(withDemoData);
      useWorkflowStore.getState().setDemoMode(withDemoData);
      useMessageHubStore.getState().setDemoMode(withDemoData);
      useIntegrationStore.getState().setDemoMode(withDemoData);

      setOnboardingComplete(true);
      saveConfigPatch({ gateway: { onboardingComplete: true } }).catch(() => {
        // Best-effort persist — onboarding is already marked complete in local state
      });
    },
    [setOnboardingComplete, setDemoMode],
  );

  const STEP_IDS: StepId[] = ["ai", "messaging", "trading", "complete"];
  const currentStepId = STEP_IDS[stepIndex];

  // Build an aiStep-like object for the active provider (backward compat with wizard component)
  const activeState = activeProvider ? getProviderState(activeProvider) : emptyProviderState();
  const aiStep: AiStepState = {
    selectedProvider: activeProvider,
    ...activeState,
  };

  return {
    stepIndex,
    currentStepId,
    aiStep,
    providerStates,
    activeProvider,
    preferredProvider,
    configuredProviders,
    anyAiConfigured,
    channelsConnected,
    platformsConnected,
    detectedProviders,
    isDetecting,
    gatewayReachable,
    selectAiProvider,
    setAiCredential,
    testAiConnection,
    setPreferred,
    nextStep,
    prevStep,
    finishOnboarding,
  };
}
