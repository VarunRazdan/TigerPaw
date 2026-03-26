import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const [config, setConfig] = useState(DEMO_CONFIG);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">{t("title")}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">{t("subtitle")}</p>
      </div>

      <div className="rounded-2xl glass-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-subtle-hover)] bg-[var(--glass-input-bg)]">
          <span className="text-xs text-neutral-500 font-mono">{t("filePath")}</span>
          <button className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-input-bg)] cursor-pointer transition-all duration-300">
            {tc("save")}
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
