import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

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
  const { t } = useTranslation("trading");
  const { currency } = useFormatters();
  const dailyPnlUsd = useTradingStore((s) => s.dailyPnlUsd);
  const currentPortfolioValueUsd = useTradingStore((s) => s.currentPortfolioValueUsd);
  const limits = useTradingStore((s) => s.limits);
  const pnlHistory = useTradingStore((s) => s.pnlHistory);
  const platforms = useTradingStore((s) => s.platforms);

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
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <div className="hidden lg:flex items-center gap-3 text-xs cursor-pointer">
            <span className="text-neutral-500">{t("dailyPnl")}:</span>
            <span className={cn("font-mono font-semibold", pnlColor)}>
              {pnlSign}
              {currency(Math.abs(dailyPnlUsd))}
            </span>
            <Sparkline data={sparklineData} />
            <div
              className="w-24 h-2 bg-[var(--glass-subtle-hover)] rounded-full overflow-hidden"
              title={t("percentDailyLoss", { percent: usedPct })}
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
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={8}
            className="z-50 rounded-xl border border-[var(--glass-chrome-border)] bg-[var(--glass-tooltip)] backdrop-blur-xl px-3 py-2 text-xs text-neutral-200 shadow-lg shadow-black/30"
          >
            <div className="space-y-1">
              <div>
                {t("dailyPnl")}:{" "}
                <span className={pnlColor}>
                  {pnlSign}
                  {currency(Math.abs(dailyPnlUsd))}
                </span>
              </div>
              <div>
                {t("lossLimitUsed")}: {usedPct}% ({lossPercent.toFixed(1)}% / {limitPercent}%)
              </div>
              <div className="border-t border-[var(--glass-subtle-hover)] pt-1 mt-1 whitespace-pre">
                {platformSummary}
              </div>
            </div>
            <TooltipPrimitive.Arrow className="fill-[var(--glass-tooltip)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
