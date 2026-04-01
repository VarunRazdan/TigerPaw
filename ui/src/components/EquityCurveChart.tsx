import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { EquityPoint } from "@/stores/strategy-store";

type Props = {
  data: EquityPoint[];
  initialCapital: number;
};

export function EquityCurveChart({ data, initialCapital }: Props) {
  const { t } = useTranslation("strategies");

  const chartData = useMemo(
    () =>
      data.map((pt) => ({
        date: new Date(pt.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        equity: Number(pt.equity.toFixed(2)),
      })),
    [data],
  );

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl glass-panel p-4">
      <h4 className="text-sm font-semibold text-neutral-300 mb-3">{t("equityCurve")}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "#737373", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#737373", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(23,23,23,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#a3a3a3" }}
            formatter={(value) => [`$${Number(value).toLocaleString()}`, "Equity"]}
          />
          <ReferenceLine y={initialCapital} stroke="#525252" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#22c55e"
            fill="url(#equityGradient)"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
