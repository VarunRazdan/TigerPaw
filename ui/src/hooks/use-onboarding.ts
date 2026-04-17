import { useState, useEffect, useCallback, useRef } from "react";
import { buildAiConfigPatch } from "@/lib/ai-providers";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { MODELS_CATALOG } from "@/lib/models-catalog";
import { saveConfigPatch } from "@/lib/save-config";
import { useAppStore } from "@/stores/app-store";
import { useIntegrationStore } from "@/stores/integration-store";
import { useMessageHubStore } from "@/stores/message-hub-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";
import { useWorkflowStore } from "@/stores/workflow-store";

export type ProviderTestStatus = "idle" | "testing" | "success" | "error";

export type StepId = "ai" | "messaging" | "integrations" | "trading" | "complete";

export type ProviderState = {
  credentials: Record<string, string>;
  testStatus: ProviderTestStatus;
  testDetail: string | null;
  testError: string | null;
  saved: boolean;
  selectedModel: string | null;
  /** Model ID loaded from config — used to detect unsaved model changes */
  savedModelId: string | null;
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
    selectedModel: null,
    savedModelId: null,
  };
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
          return { id: t.id, ok: res.ok && res.payload?.ok === true };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          reachable = true;
          detected[r.value.id] = r.value.ok;
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
        const result = await gatewayRpc<{
          raw?: string;
          config?: {
            models?: { providers?: Record<string, unknown> };
            agents?: { defaults?: { model?: unknown } };
          };
        }>("config.get", {});
        if (cancelled || !result.ok) {
          return;
        }

        // Try config object first (always available), then fall back to raw JSON
        let providers: Record<string, unknown> | undefined;
        let defaultModel: unknown;
        if (result.payload?.config) {
          providers = result.payload.config.models?.providers;
          defaultModel = result.payload.config.agents?.defaults?.model;
        } else if (result.payload?.raw) {
          const parsed = JSON.parse(result.payload.raw) as Record<string, unknown>;
          providers = (parsed.models as Record<string, unknown>)?.providers as
            | Record<string, unknown>
            | undefined;
          defaultModel = (parsed.agents as Record<string, unknown>)?.defaults;
          if (defaultModel && typeof defaultModel === "object") {
            defaultModel = (defaultModel as Record<string, unknown>).model;
          }
        }
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

            // Determine preferred from agents.defaults.model: { primary: "provider/model" } or "provider/model"
            let preferred: string | null = null;
            let modelStr: string | null = null;
            if (typeof defaultModel === "string") {
              modelStr = defaultModel;
            } else if (defaultModel && typeof defaultModel === "object") {
              const obj = defaultModel as Record<string, unknown>;
              modelStr = typeof obj.primary === "string" ? obj.primary : null;
            }
            let currentModelId: string | null = null;
            if (modelStr && modelStr.includes("/")) {
              preferred = modelStr.split("/")[0];
              currentModelId = modelStr.split("/").slice(1).join("/");
            }
            setPreferredProvider((prev) => prev ?? preferred ?? ids[0]);
            // Pre-load the current model into the preferred provider's state
            if (preferred && currentModelId) {
              setProviderStates((prev) => ({
                ...prev,
                [preferred]: {
                  ...(prev[preferred] ?? emptyProviderState()),
                  saved: true,
                  testStatus: "success" as const,
                  testDetail: "Previously configured",
                  selectedModel: currentModelId,
                  savedModelId: currentModelId,
                },
              }));
            }
          }
        }
      } catch {
        // Gateway offline
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
        // Don't save to config here — just mark as tested.
        // Credentials are stored in memory. The "Save and Set" button
        // will persist everything in one atomic config.patch call.
        const catalogModels = MODELS_CATALOG[id]?.models?.filter((m) => !m.deprecated);
        const autoSelected = catalogModels?.[0]?.id ?? null;
        setProviderStates((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? emptyProviderState()),
            credentials: creds,
            testStatus: "success",
            testDetail: result.payload.detail ?? "Connected",
            saved: false, // not saved to config yet — user must click "Save and Set"
            selectedModel: prev[id]?.selectedModel ?? autoSelected,
          },
        }));
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

  const setSelectedModel = useCallback((providerId: string, modelId: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...(prev[providerId] ?? emptyProviderState()), selectedModel: modelId },
    }));
  }, []);

  // Save credentials only (no active provider change)
  const saveCredentials = useCallback(
    async (id: string) => {
      const state = providerStates[id];
      const creds = state?.credentials ?? {};
      const patch = buildAiConfigPatch(id, creds);
      if (Object.keys(patch).length > 0) {
        const result = await saveConfigPatch(patch);
        if (result.ok) {
          setProviderStates((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? emptyProviderState()), saved: true },
          }));
        }
      }
    },
    [providerStates],
  );

  // Save credentials AND set as active provider
  // Read state via ref to avoid stale closure — providerStates may have changed
  // between when the callback was memoized and when it's called (e.g., user
  // selects a model then immediately clicks Save).
  const providerStatesRef = useRef(providerStates);
  providerStatesRef.current = providerStates;

  const setPreferred = useCallback(async (id: string) => {
    setPreferredProvider(id);
    const state = providerStatesRef.current[id];
    const creds = state?.credentials ?? {};
    const credPatch = buildAiConfigPatch(id, creds);
    const catalogModels = MODELS_CATALOG[id]?.models?.filter((m) => !m.deprecated);
    const selectedModelId = state?.selectedModel || catalogModels?.[0]?.id;
    const modelPatch = selectedModelId
      ? { agents: { defaults: { model: { primary: `${id}/${selectedModelId}`, fallbacks: [] } } } }
      : {};
    const combinedPatch = { ...credPatch, ...modelPatch };
    if (Object.keys(combinedPatch).length > 0) {
      const result = await saveConfigPatch(combinedPatch);
      if (result.ok) {
        setProviderStates((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? emptyProviderState()),
            saved: true,
            savedModelId: selectedModelId ?? null,
          },
        }));
        // No restart needed — model config is hot-reloadable via config file watcher
      }
    }
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, 4));
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
      void saveConfigPatch({ gateway: { onboardingComplete: true } });
    },
    [setOnboardingComplete, setDemoMode],
  );

  const STEP_IDS: StepId[] = ["ai", "messaging", "integrations", "trading", "complete"];
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
    saveCredentials,
    setPreferred,
    setSelectedModel,
    nextStep,
    prevStep,
    finishOnboarding,
  };
}
