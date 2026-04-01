import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataModeSelector } from "@/components/DataModeSelector";
import { saveConfigPatch } from "@/lib/save-config";
import { useNotificationStore } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";

const LIVE_PLACEHOLDER = "// Connect gateway to view live configuration\n// Run: tigerpaw start";

const DEMO_CONFIG = `{
  "trading": {
    "enabled": true,
    "mode": "paper",
    "policy": {
      "tier": "moderate",
      "approvalMode": "confirm",
      "limits": {
        "maxRiskPerTradePercent": 2,
        "dailyLossLimitPercent": 5,
        "maxPortfolioDrawdownPercent": 20,
        "maxSinglePositionPercent": 10,
        "maxTradesPerDay": 25,
        "maxOpenPositions": 8,
        "cooldownBetweenTradesMs": 30000,
        "consecutiveLossPause": 5,
        "maxDailySpendUsd": 500,
        "maxSingleTradeUsd": 100
      }
    }
  },
  "extensions": {
    "alpaca": {
      "apiKeyId": "****",
      "apiSecretKey": "****",
      "mode": "paper"
    },
    "polymarket": {
      "apiKey": "****",
      "apiSecret": "****"
    }
  }
}`;

export function ConfigPage() {
  const { t } = useTranslation("config");
  const { t: tc } = useTranslation("common");
  const demoMode = useTradingStore((s) => s.demoMode);
  const [config, setConfig] = useState(() =>
    useTradingStore.getState().demoMode ? DEMO_CONFIG : LIVE_PLACEHOLDER,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(demoMode ? DEMO_CONFIG : LIVE_PLACEHOLDER);
  }, [demoMode]);

  async function handleSave() {
    const { addNotification } = useNotificationStore.getState();
    const toast = (severity: "success" | "warning" | "error", description: string) =>
      addNotification({
        type: "config",
        title: t("title"),
        description,
        severity,
        timestamp: Date.now(),
      });

    if (demoMode) {
      toast("warning", t("demoSaveBlocked"));
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(config);
    } catch {
      toast("error", t("invalidJson"));
      return;
    }

    setSaving(true);
    try {
      const result = await saveConfigPatch(parsed);
      if (result.ok) {
        toast("success", t("saveSuccess"));
      } else {
        toast("error", result.error);
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("title")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <DataModeSelector />
      </div>

      <div className="rounded-2xl glass-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-subtle-hover)] bg-[var(--glass-input-bg)]">
          <span className="text-xs text-neutral-500 font-mono">{t("filePath")}</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-input-bg)] cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? tc("loading") : tc("save")}
          </button>
        </div>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          className="w-full h-[500px] bg-neutral-950/50 text-neutral-300 text-xs font-mono p-4 focus:outline-none resize-none hover:bg-[var(--glass-subtle-hover)] transition-all duration-200"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
