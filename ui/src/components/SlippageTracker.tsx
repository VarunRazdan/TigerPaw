import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

export function SlippageTracker() {
  const tradeHistory = useTradingStore((s) => s.tradeHistory);

  const stats = useMemo(() => {
    const filled = tradeHistory.filter(
      (t) => t.result === "filled" && t.expectedPrice != null && t.executedPrice != null,
    );
    if (filled.length === 0) {
      return null;
    }

    let totalSlippage = 0;
    let favorableCount = 0;
    let adverseCount = 0;
    let maxAdverse = 0;

    const entries = filled.map((t) => {
      const expected = t.expectedPrice!;
      const executed = t.executedPrice!;
      const slipBps = expected > 0 ? ((executed - expected) / expected) * 10000 : 0;
      const isBuy = t.side.toLowerCase() === "buy";
      // For buys, positive slip (paid more) is adverse; for sells, negative slip is adverse
      const adverseSlip = isBuy ? slipBps : -slipBps;

      totalSlippage += adverseSlip;
      if (adverseSlip > 0) {
        adverseCount++;
      } else if (adverseSlip < 0) {
        favorableCount++;
      }
      maxAdverse = Math.max(maxAdverse, adverseSlip);

      return { ...t, slipBps: adverseSlip };
    });

    const avgSlippage = totalSlippage / filled.length;

    return { entries, avgSlippage, favorableCount, adverseCount, maxAdverse, total: filled.length };
  }, [tradeHistory]);

  if (!stats) {
    return (
      <div className="rounded-2xl glass-panel p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Slippage Tracker</h3>
        <p className="text-xs text-neutral-600 py-4 text-center">
          No filled orders with price data yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl glass-panel p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Slippage Tracker</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">Avg Slippage</div>
          <div
            className={cn(
              "text-sm font-mono font-bold",
              stats.avgSlippage > 1
                ? "text-red-400"
                : stats.avgSlippage < -1
                  ? "text-green-400"
                  : "text-neutral-300",
            )}
          >
            {stats.avgSlippage > 0 ? "+" : ""}
            {stats.avgSlippage.toFixed(1)} bps
          </div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">Max Adverse</div>
          <div className="text-sm font-mono font-bold text-red-400">
            +{stats.maxAdverse.toFixed(1)} bps
          </div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">Favorable</div>
          <div className="text-sm font-mono font-bold text-green-400">
            {stats.favorableCount}/{stats.total}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">Adverse</div>
          <div className="text-sm font-mono font-bold text-red-400">
            {stats.adverseCount}/{stats.total}
          </div>
        </div>
      </div>

      {/* Recent slippage entries */}
      <div className="space-y-1">
        {stats.entries
          .slice(-5)
          .toReversed()
          .map((entry, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs py-1 border-b border-[var(--glass-divider)] last:border-0"
            >
              <span className="text-neutral-400">
                {entry.side.toUpperCase()} {entry.symbol}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-neutral-500 font-mono">
                  ${entry.expectedPrice?.toFixed(2)} → ${entry.executedPrice?.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "font-mono font-semibold",
                    entry.slipBps > 1
                      ? "text-red-400"
                      : entry.slipBps < -1
                        ? "text-green-400"
                        : "text-neutral-400",
                  )}
                >
                  {entry.slipBps > 0 ? "+" : ""}
                  {entry.slipBps.toFixed(1)} bps
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
