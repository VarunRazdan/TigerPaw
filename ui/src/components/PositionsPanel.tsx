import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";
import { StopLossConfig } from "./StopLossConfig";

export function PositionsPanel() {
  const { positions, limits } = useTradingStore();

  return (
    <div className="rounded-2xl glass-panel p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">
        Positions
        <span className="ml-2 text-xs text-neutral-500 font-normal">
          {positions.length}/{limits.maxOpenPositions}
        </span>
      </h3>
      {positions.length === 0 ? (
        <p className="text-xs text-neutral-600 py-4 text-center">No open positions</p>
      ) : (
        <div className="space-y-2">
          {positions.map((pos) => (
            <div
              key={`${pos.extensionId}-${pos.symbol}`}
              className="py-2 border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-divider)] transition-colors duration-200 rounded-md px-2 -mx-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200">{pos.symbol}</span>
                  <span className="text-xs px-1 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-500">
                    {pos.extensionId}
                  </span>
                </div>
                <div className="text-right">
                  <div
                    className={cn(
                      "text-sm font-mono",
                      pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {pos.percentOfPortfolio.toFixed(1)}%
                    {pos.percentOfPortfolio > limits.maxSinglePositionPercent && (
                      <span className="text-amber-400 ml-1">!</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Inline SL/TP config */}
              <div className="mt-1">
                <StopLossConfig position={pos} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Concentration bar */}
      {positions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          <div className="text-xs text-neutral-500 mb-1">Concentration</div>
          <div className="flex gap-0.5 h-3 rounded overflow-hidden bg-[var(--glass-subtle-hover)]">
            {positions.map((pos) => (
              <div
                key={`${pos.extensionId}-${pos.symbol}`}
                className={cn(
                  "transition-all",
                  pos.percentOfPortfolio > limits.maxSinglePositionPercent
                    ? "bg-amber-500"
                    : "bg-blue-500",
                )}
                style={{ width: `${Math.min(pos.percentOfPortfolio, 100)}%` }}
                title={`${pos.symbol}: ${pos.percentOfPortfolio.toFixed(1)}%`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
