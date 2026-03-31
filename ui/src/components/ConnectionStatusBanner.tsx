import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/app-store";
import { useTradingStore } from "@/stores/trading-store";

type Props = {
  onRetry: () => void;
};

/**
 * Full-width status banner rendered between header and main content.
 *
 * Three mutually-exclusive states (highest priority first):
 *   1. Gateway unreachable  (red)
 *   2. WebSocket disconnected / reconnecting  (amber)
 *   3. Demo mode active  (blue)
 */
export function ConnectionStatusBanner({ onRetry }: Props) {
  const { t } = useTranslation("common");
  const gatewayOnline = useAppStore((s) => s.gatewayOnline);
  const wsConnected = useTradingStore((s) => s.wsConnected);
  const wsReconnectAttempts = useTradingStore((s) => s.wsReconnectAttempts);
  const demoMode = useTradingStore((s) => s.demoMode);

  // 1. Gateway offline
  if (!gatewayOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-red-500/10 border-b border-red-500/30 text-red-300 text-xs px-4 py-1.5 flex items-center justify-center gap-3"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
        <span>{t("error.gatewayUnreachable", "Gateway unreachable")}</span>
        <button
          onClick={onRetry}
          className="ml-1 underline underline-offset-2 hover:text-red-200 cursor-pointer"
        >
          {t("error.retryNow", "Retry now")}
        </button>
      </div>
    );
  }

  // 2. WebSocket disconnected
  if (!wsConnected && !demoMode) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-xs px-4 py-1.5 text-center"
      >
        {wsReconnectAttempts > 0
          ? t("error.wsReconnecting", {
              defaultValue: "Live connection lost \u2014 reconnecting (attempt {{count}})",
              count: wsReconnectAttempts,
            })
          : t("error.wsDisconnected", "Live connection lost \u2014 reconnecting")}
      </div>
    );
  }

  // 3. Demo mode
  if (demoMode) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-blue-500/10 border-b border-blue-500/30 text-blue-300 text-xs px-4 py-1.5 text-center"
      >
        {t("error.demoMode", "Demo mode \u2014 data is simulated")}
      </div>
    );
  }

  return null;
}
