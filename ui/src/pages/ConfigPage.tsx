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

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-white/[0.05]">
          <span className="text-xs text-neutral-500 font-mono">~/.tigerpaw/tigerpaw.json</span>
          <button className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.05] cursor-pointer transition-all duration-300">
            Save
          </button>
        </div>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          className="w-full h-[500px] bg-neutral-950/50 text-neutral-300 text-xs font-mono p-4 focus:outline-none resize-none hover:bg-white/[0.07] transition-all duration-200"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
