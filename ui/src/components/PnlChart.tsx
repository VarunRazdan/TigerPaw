import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

type PnlDataPoint = {
  date: string;
  pnl: number;
};

type TimeRange = "1W" | "1M" | "6M" | "custom";

const RANGE_KEYS: { value: TimeRange; key: string }[] = [
  { value: "1W", key: "chart.range1W" },
  { value: "1M", key: "chart.range1M" },
  { value: "6M", key: "chart.range6M" },
  { value: "custom", key: "chart.rangeCustom" },
];

// ── Seeded random for deterministic demo data ───────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateDemoData(days: number, seed: number): PnlDataPoint[] {
  const rng = seededRandom(seed);
  const result: PnlDataPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const label =
      days <= 31
        ? `${monthNames[d.getMonth()]} ${d.getDate()}`
        : `${monthNames[d.getMonth()]} ${d.getDate()}`;

    // Generate realistic-ish P&L: mostly small moves, occasional big days
    const base = (rng() - 0.45) * 200;
    const spike = rng() > 0.85 ? (rng() - 0.5) * 400 : 0;
    const pnl = Math.round((base + spike) * 100) / 100;
    result.push({ date: label, pnl });
  }
  return result;
}

function filterDataByDateRange(
  data: PnlDataPoint[],
  startDate: string,
  endDate: string,
): PnlDataPoint[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  const year = now.getFullYear();

  return data.filter((d) => {
    // Parse "Mar 10" style dates using current year
    const parsed = new Date(`${d.date}, ${year}`);
    return parsed >= start && parsed <= end;
  });
}

// ── Chart tooltip ───────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const value = payload[0].value;
  return (
    <div className="bg-[var(--glass-tooltip)] border border-[var(--glass-border)] backdrop-blur-xl rounded px-3 py-2 shadow-lg">
      <div className="text-xs text-neutral-400">{label}</div>
      <div
        className={`text-sm font-mono font-bold ${value >= 0 ? "text-green-400" : "text-red-400"}`}
      >
        {value >= 0 ? "+" : ""}${value.toFixed(2)}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function PnlChart({ data: dataProp }: { data?: PnlDataPoint[] }) {
  const { t } = useTranslation("trading");
  const storeHistory = useTradingStore((s) => s.pnlHistory);
  const demoMode = useTradingStore((s) => s.demoMode);
  const [range, setRange] = useState<TimeRange>("1W");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Use real data when available; only use demo data when demoMode is on
  const rangeData = useMemo<Record<"1W" | "1M" | "6M", PnlDataPoint[]>>(() => {
    return {
      "1W":
        storeHistory.length >= 7 ? storeHistory.slice(-7) : demoMode ? generateDemoData(7, 42) : [],
      "1M":
        storeHistory.length >= 30
          ? storeHistory.slice(-30)
          : demoMode
            ? generateDemoData(30, 137)
            : [],
      "6M":
        storeHistory.length >= 180
          ? storeHistory.slice(-180)
          : demoMode
            ? generateDemoData(180, 891)
            : [],
    };
  }, [storeHistory, demoMode]);

  const data = useMemo(() => {
    if (dataProp) {
      return dataProp;
    }
    if (range === "custom" && customStart && customEnd) {
      const fullData = rangeData["6M"];
      const filtered = filterDataByDateRange(fullData, customStart, customEnd);
      return filtered.length > 0 ? filtered : rangeData["1W"];
    }
    if (range === "custom") {
      return rangeData["1W"];
    }
    return rangeData[range];
  }, [dataProp, range, rangeData, customStart, customEnd]);

  const totalPnl = useMemo(() => {
    return data.reduce((sum, d) => sum + d.pnl, 0);
  }, [data]);

  // For 6M, only show every Nth label to avoid overlap
  const tickInterval = data.length > 60 ? Math.floor(data.length / 12) : data.length > 30 ? 3 : 0;

  return (
    <div className="rounded-2xl glass-panel p-4">
      {/* Header with range selector */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-neutral-300">
          {t("dailyPnlDays", { count: data.length })}
        </h3>

        <div className="flex items-center gap-1">
          {RANGE_KEYS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer",
                range === opt.value
                  ? "bg-orange-600/80 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-[var(--glass-input-bg)]",
              )}
            >
              {t(opt.key)}
            </button>
          ))}

          <span
            className={`ml-2 text-sm font-mono font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Custom date range inputs */}
      {range === "custom" && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-2 text-xs text-neutral-300 focus:border-orange-500 focus:outline-none"
          />
          <span className="text-neutral-600 text-xs">{t("common:to")}</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-2 text-xs text-neutral-300 focus:border-orange-500 focus:outline-none"
          />
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <ReferenceLine y={0} stroke="#737373" strokeDasharray="3 3" />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
