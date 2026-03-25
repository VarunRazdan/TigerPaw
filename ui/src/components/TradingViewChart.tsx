import { BarChart3, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useThemeStore, THEMES } from "@/stores/theme-store";

type Props = {
  symbol: string;
  height?: number;
  interval?: string;
  className?: string;
  defaultCollapsed?: boolean;
};

/**
 * Embeds a TradingView Advanced Chart widget via their script API.
 * No API key needed — TradingView hosts everything.
 * Includes a show/hide toggle to save screen real estate.
 */
export function TradingViewChart({
  symbol,
  height = 400,
  interval = "D",
  className,
  defaultCollapsed = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = `tv-widget-${symbol.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const theme = useThemeStore((s) => s.theme);
  const themeInfo = THEMES[theme];

  useEffect(() => {
    if (collapsed) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Clear previous widget
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.addEventListener("load", () => {
      if (typeof (window as Record<string, unknown>).TradingView === "undefined") {
        return;
      }
      const TV = (window as Record<string, unknown>).TradingView as {
        widget: new (opts: Record<string, unknown>) => unknown;
      };
      new TV.widget({
        container_id: container.id,
        symbol,
        interval,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: themeInfo.chartToolbar,
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        width: "100%",
        height,
        backgroundColor: themeInfo.chartBg,
        gridColor: "rgba(255, 255, 255, 0.04)",
      });
    });
    document.head.appendChild(script);

    return () => {
      script.remove();
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [symbol, interval, height, collapsed, theme, themeInfo.chartBg, themeInfo.chartToolbar]);

  return (
    <div className={cn("rounded-2xl glass-panel overflow-hidden", className)}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-divider)] transition-all duration-200 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          {symbol} Chart
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-200",
            !collapsed && "rotate-180",
          )}
        />
      </button>

      {!collapsed && <div id={widgetId} ref={containerRef} />}
    </div>
  );
}
