import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  type CandlestickData,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type PriceChartProps = {
  data?: CandlestickData[];
  stopLoss?: number;
  takeProfit?: number;
  className?: string;
  height?: number;
};

const DEMO_CANDLES: CandlestickData[] = (() => {
  const candles: CandlestickData[] = [];
  let close = 178;
  const baseDate = new Date("2026-03-08");
  for (let i = 0; i < 30; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0] as unknown as Time;
    const open = close + (Math.random() - 0.5) * 4;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    close = open + (Math.random() - 0.48) * 6;
    candles.push({ time: dateStr, open, high, low, close });
  }
  return candles;
})();

export function PriceChart({
  data = DEMO_CANDLES,
  stopLoss,
  takeProfit,
  className,
  height = 260,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#525252",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      width: containerRef.current.clientWidth,
      height,
      crosshair: {
        vertLine: { color: "#404040", labelBackgroundColor: "#262626" },
        horzLine: { color: "#404040", labelBackgroundColor: "#262626" },
      },
      timeScale: {
        borderColor: "#262626",
      },
      rightPriceScale: {
        borderColor: "#262626",
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });
    seriesRef.current = series;
    series.setData(data);

    if (stopLoss) {
      series.createPriceLine({
        price: stopLoss,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "SL",
      });
    }
    if (takeProfit) {
      series.createPriceLine({
        price: takeProfit,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "TP",
      });
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, stopLoss, takeProfit, height]);

  return (
    <div className={cn("rounded-lg border border-neutral-800 bg-neutral-900/50 p-4", className)}>
      <h3 className="text-sm font-semibold text-neutral-300 mb-2">Price Chart</h3>
      <div ref={containerRef} />
    </div>
  );
}
