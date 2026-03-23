import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

export function PositionHeatMap() {
  const { positions, limits } = useTradingStore();

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Position Heat Map</h3>
        <p className="text-xs text-neutral-600 py-4 text-center">No open positions</p>
      </div>
    );
  }

  const maxValue = Math.max(...positions.map((p) => p.valueUsd));

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Position Heat Map</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {positions.map((pos) => {
          const sizeRatio = maxValue > 0 ? pos.valueUsd / maxValue : 0.5;
          const minH = 60;
          const maxH = 120;
          const h = Math.round(minH + sizeRatio * (maxH - minH));
          const pnlPercent = pos.valueUsd > 0 ? (pos.unrealizedPnl / pos.valueUsd) * 100 : 0;
          const isOverConcentrated = pos.percentOfPortfolio > limits.maxSinglePositionPercent;

          const bgColor =
            pos.unrealizedPnl >= 0
              ? pnlPercent > 5
                ? "bg-green-800/60"
                : "bg-green-900/40"
              : pnlPercent < -5
                ? "bg-red-800/60"
                : "bg-red-900/40";

          const borderColor = isOverConcentrated
            ? "border-amber-600"
            : pos.unrealizedPnl >= 0
              ? "border-green-800/50"
              : "border-red-800/50";

          return (
            <div
              key={`${pos.extensionId}-${pos.symbol}`}
              className={cn(
                "rounded-md border p-3 flex flex-col justify-between hover:scale-[1.02] cursor-pointer transition-all duration-300",
                bgColor,
                borderColor,
              )}
              style={{ minHeight: `${h}px` }}
              title={`${pos.symbol} on ${pos.extensionId}: $${pos.valueUsd.toFixed(0)} (${pos.percentOfPortfolio.toFixed(1)}% of portfolio)`}
            >
              <div>
                <div className="text-sm font-semibold text-neutral-100 truncate">{pos.symbol}</div>
                <div className="text-[10px] text-neutral-500">{pos.extensionId}</div>
              </div>
              <div>
                <div className="text-sm font-mono font-bold text-neutral-200">
                  ${pos.valueUsd.toFixed(0)}
                </div>
                <div
                  className={cn(
                    "text-xs font-mono",
                    pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400",
                  )}
                >
                  {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                  <span className="text-neutral-500 ml-1">({pnlPercent.toFixed(1)}%)</span>
                </div>
                <div
                  className={cn(
                    "text-[10px] mt-0.5",
                    isOverConcentrated ? "text-amber-400" : "text-neutral-500",
                  )}
                >
                  {pos.percentOfPortfolio.toFixed(1)}% of portfolio
                  {isOverConcentrated && " — over limit"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
