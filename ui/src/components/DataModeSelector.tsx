import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useIntegrationStore } from "@/stores/integration-store";
import { useMessageHubStore } from "@/stores/message-hub-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";
import { useWorkflowStore } from "@/stores/workflow-store";

/** Sync demo mode across all stores that carry demo state. */
export function syncAllDemoMode(enabled: boolean) {
  useTradingStore.getState().setDemoMode(enabled);
  useNotificationStore.getState().setDemoMode(enabled);
  useWorkflowStore.getState().setDemoMode(enabled);
  useMessageHubStore.getState().setDemoMode(enabled);
  useIntegrationStore.getState().setDemoMode(enabled);
}

/** Compact pill toggle for switching between Demo and Live data. */
export function DataModeSelector() {
  const { t } = useTranslation("common");
  const demoMode = useTradingStore((s) => s.demoMode);

  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-subtle)] p-0.5">
      <button
        onClick={() => syncAllDemoMode(true)}
        className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer",
          demoMode ? "bg-amber-600 text-white" : "text-neutral-500 hover:text-neutral-300",
        )}
      >
        {t("demo", "Demo")}
      </button>
      <button
        onClick={() => syncAllDemoMode(false)}
        className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer",
          !demoMode ? "bg-green-600 text-white" : "text-neutral-500 hover:text-neutral-300",
        )}
      >
        {t("live", "Live")}
      </button>
    </div>
  );
}
