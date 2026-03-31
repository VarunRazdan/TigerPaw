import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

type CircularGaugeProps = {
  label: string;
  current: number;
  limit: number;
  unit?: string;
  format?: (v: number) => string;
  size?: number;
};

function CircularGauge({
  label,
  current,
  limit,
  unit = "",
  format,
  size = 80,
}: CircularGaugeProps) {
  const fraction = limit > 0 ? Math.min(current / limit, 1) : 0;
  const display = format ? format(current) : `${current}`;

  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  const strokeColor = fraction >= 1 ? "#ef4444" : fraction >= 0.8 ? "#f59e0b" : "#22c55e";

  const textColor =
    fraction >= 1 ? "text-red-400" : fraction >= 0.8 ? "text-amber-400" : "text-green-400";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-xs font-mono font-bold leading-none", textColor)}>
            {display}
            {unit}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-neutral-500 text-center leading-tight">{label}</span>
    </div>
  );
}

type RiskBarProps = {
  label: string;
  current: number;
  limit: number;
  unit?: string;
  format?: (v: number) => string;
};

function RiskBar({ label, current, limit, unit = "", format }: RiskBarProps) {
  const fraction = limit > 0 ? Math.min(current / limit, 1) : 0;
  const pct = Math.round(fraction * 100);
  const display = format ? format(current) : `${current}`;
  const limitDisplay = format ? format(limit) : `${limit}`;

  const statusColor =
    fraction >= 1 ? "text-red-400" : fraction >= 0.8 ? "text-amber-400" : "text-green-400";

  const barColor =
    fraction >= 1 ? "bg-red-500" : fraction >= 0.8 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-neutral-400">{label}</span>
        <span className={cn("font-mono", statusColor)}>
          {display}
          {unit} / {limitDisplay}
          {unit}
        </span>
      </div>
      <div className="w-full h-1.5 bg-[var(--glass-subtle-hover)] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RiskOverviewPanel() {
  const { t } = useTranslation("trading");
  const { compact } = useFormatters();
  const dailyPnlUsd = useTradingStore((s) => s.dailyPnlUsd);
  const currentPortfolioValueUsd = useTradingStore((s) => s.currentPortfolioValueUsd);
  const highWaterMarkUsd = useTradingStore((s) => s.highWaterMarkUsd);
  const dailySpendUsd = useTradingStore((s) => s.dailySpendUsd);
  const dailyTradeCount = useTradingStore((s) => s.dailyTradeCount);
  const consecutiveLosses = useTradingStore((s) => s.consecutiveLosses);
  const positions = useTradingStore((s) => s.positions);
  const limits = useTradingStore((s) => s.limits);

  const dailyLossPercent =
    currentPortfolioValueUsd > 0
      ? (Math.abs(Math.min(0, dailyPnlUsd)) / currentPortfolioValueUsd) * 100
      : 0;

  const drawdownPercent =
    highWaterMarkUsd > 0
      ? ((highWaterMarkUsd - currentPortfolioValueUsd) / highWaterMarkUsd) * 100
      : 0;

  const maxPositionConcentration =
    positions.length > 0 ? Math.max(...positions.map((p) => p.percentOfPortfolio)) : 0;

  return (
    <div className="rounded-2xl glass-panel p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4">{t("riskOverview")}</h3>

      {/* Circular gauges for top metrics */}
      <div className="flex justify-around mb-4 pb-4 border-b border-[var(--glass-border)]">
        <CircularGauge
          label={t("dailyLoss")}
          current={Number(dailyLossPercent.toFixed(1))}
          limit={limits.dailyLossLimitPercent}
          unit="%"
        />
        <CircularGauge
          label={t("drawdown")}
          current={Number(drawdownPercent.toFixed(1))}
          limit={limits.maxPortfolioDrawdownPercent}
          unit="%"
        />
        <CircularGauge
          label={t("spend")}
          current={dailySpendUsd}
          limit={limits.maxDailySpendUsd}
          format={compact}
        />
      </div>

      {/* Bar gauges for secondary metrics */}
      <div className="space-y-0.5">
        <RiskBar
          label={t("positions")}
          current={positions.length}
          limit={limits.maxOpenPositions}
        />
        <RiskBar
          label={t("tradesToday")}
          current={dailyTradeCount}
          limit={limits.maxTradesPerDay}
        />
        <RiskBar
          label={t("concentration")}
          current={Number(maxPositionConcentration.toFixed(1))}
          limit={limits.maxSinglePositionPercent}
          unit="%"
        />
        <RiskBar
          label={t("consecutiveLosses")}
          current={consecutiveLosses}
          limit={limits.consecutiveLossPause}
        />
      </div>
    </div>
  );
}
