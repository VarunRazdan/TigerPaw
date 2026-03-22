import { useState } from "react";

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
  const [config, setConfig] = useState(DEMO_CONFIG);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">Configuration</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Edit tigerpaw.json — secrets are masked</p>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900">
          <span className="text-xs text-neutral-500 font-mono">~/.tigerpaw/tigerpaw.json</span>
          <button className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded border border-neutral-700 hover:border-neutral-600 transition-colors">
            Save
          </button>
        </div>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          className="w-full h-[500px] bg-neutral-950 text-neutral-300 text-xs font-mono p-4 focus:outline-none resize-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
