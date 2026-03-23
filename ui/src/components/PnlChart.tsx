import { useMemo } from "react";
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
import { useTradingStore } from "@/stores/trading-store";

type PnlDataPoint = {
  date: string;
  pnl: number;
};

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
    <div className="bg-neutral-900/90 border border-white/[0.1] backdrop-blur-xl rounded px-3 py-2 shadow-lg">
      <div className="text-xs text-neutral-400">{label}</div>
      <div
        className={`text-sm font-mono font-bold ${value >= 0 ? "text-green-400" : "text-red-400"}`}
      >
        {value >= 0 ? "+" : ""}${value.toFixed(2)}
      </div>
    </div>
  );
}

export function PnlChart({ data: dataProp }: { data?: PnlDataPoint[] }) {
  const storeHistory = useTradingStore((s) => s.pnlHistory);
  const data = dataProp ?? storeHistory;
  const cumulativeData = useMemo(() => {
    let cum = 0;
    return data.map((d) => {
      cum += d.pnl;
      return { ...d, cumulative: cum };
    });
  }, [data]);

  const totalPnl =
    cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].cumulative : 0;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">Daily P&L ({data.length} days)</h3>
        <span
          className={`text-sm font-mono font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#525252" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#525252" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <ReferenceLine y={0} stroke="#404040" strokeDasharray="3 3" />
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
