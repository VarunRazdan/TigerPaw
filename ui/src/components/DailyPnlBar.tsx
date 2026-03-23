import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

function Sparkline({
  data,
  width = 60,
  height = 16,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return null;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");

  const lastVal = data[data.length - 1];
  const strokeColor = lastVal >= 0 ? "#22c55e" : "#ef4444";

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DailyPnlBar() {
  const { dailyPnlUsd, currentPortfolioValueUsd, limits, pnlHistory, platforms } =
    useTradingStore();

  const lossPercent =
    currentPortfolioValueUsd > 0
      ? (Math.abs(Math.min(0, dailyPnlUsd)) / currentPortfolioValueUsd) * 100
      : 0;
  const limitPercent = limits.dailyLossLimitPercent;
  const usedFraction = limitPercent > 0 ? Math.min(lossPercent / limitPercent, 1) : 0;
  const usedPct = Math.round(usedFraction * 100);

  const color =
    usedFraction >= 0.8 ? "bg-red-500" : usedFraction >= 0.5 ? "bg-amber-500" : "bg-green-500";

  const pnlSign = dailyPnlUsd >= 0 ? "+" : "";
  const pnlColor = dailyPnlUsd >= 0 ? "text-green-400" : "text-red-400";

  // Use pnlHistory for sparkline, fall back to empty
  const sparklineData =
    pnlHistory.length >= 2 ? pnlHistory.map((p) => p.pnl) : [12, -5, 23, -18, 6, -1, dailyPnlUsd]; // demo fallback

  // Platform breakdown for tooltip
  const platformSummary = Object.values(platforms)
    .map((p) => `${p.label}: ${p.mode}`)
    .join("\n");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hidden sm:flex items-center gap-3 text-xs cursor-pointer">
            <span className="text-neutral-500">Daily P&L:</span>
            <span className={cn("font-mono font-semibold", pnlColor)}>
              {pnlSign}${Math.abs(dailyPnlUsd).toFixed(2)}
            </span>
            <Sparkline data={sparklineData} />
            <div
              className="w-24 h-2 bg-white/[0.06] rounded-full overflow-hidden"
              title={`${usedPct}% of daily loss limit`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  color,
                  usedFraction >= 1 && "animate-pulse",
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <span className="text-neutral-600">{usedPct}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div>
              Daily P&L:{" "}
              <span className={pnlColor}>
                {pnlSign}${Math.abs(dailyPnlUsd).toFixed(2)}
              </span>
            </div>
            <div>
              Loss limit used: {usedPct}% ({lossPercent.toFixed(1)}% / {limitPercent}%)
            </div>
            <div className="border-t border-white/[0.08] pt-1 mt-1 whitespace-pre">
              {platformSummary}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
