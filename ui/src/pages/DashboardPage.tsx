import { Power } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { ConnectDialog } from "@/components/ConnectDialog";
import { DataModeSelector } from "@/components/DataModeSelector";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { PlatformApiInfo } from "@/components/PlatformApiInfo";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PnlChart } from "@/components/PnlChart";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchCryptoPrices, type CryptoPrice } from "@/lib/coingecko";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTradingStore } from "@/stores/trading-store";

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl glass-panel p-4">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={cn("text-2xl font-bold font-mono truncate", color ?? "text-neutral-100")}>
        {value}
      </div>
      {subtext && <div className="text-xs text-neutral-500 mt-1">{subtext}</div>}
    </div>
  );
}

function modeColor(mode: string): string {
  return mode === "live" || mode === "mainnet" ? "text-green-400" : "text-blue-400";
}

function modeDot(mode: string): string {
  return mode === "live" || mode === "mainnet" ? "bg-green-400" : "bg-blue-400";
}

function ExtensionsGrid({
  platforms,
}: {
  platforms: Record<string, { label: string; connected: boolean; mode: string }>;
}) {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation("common");
  const [connectId, setConnectId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const connectInfo = connectId ? TRADING_CONNECT_INFO[connectId] : null;
  const disconnectPlatform = useTradingStore((s) => s.disconnectPlatform);

  return (
    <>
      <div className="rounded-2xl glass-panel p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">{t("tradingExtensions")}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(platforms).map(([id, p]) => (
            <div
              key={id}
              onClick={() => !p.connected && TRADING_CONNECT_INFO[id] && setConnectId(id)}
              className={cn(
                "flex items-center gap-2 py-2 px-2 -mx-2 rounded-lg transition-colors duration-200",
                !p.connected && TRADING_CONNECT_INFO[id]
                  ? "cursor-pointer hover:bg-[var(--glass-subtle-hover)]"
                  : "hover:bg-[var(--glass-divider)] cursor-default",
              )}
            >
              <PlatformIcon platformId={id} className="w-4 h-4" />
              <span
                className={cn("text-sm", p.connected ? "text-neutral-300" : "text-neutral-500")}
              >
                {p.label}
              </span>
              <div className="flex items-center gap-1.5 ml-auto">
                {p.connected ? (
                  <>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", modeDot(p.mode))} />
                    <span className={cn("text-xs font-medium capitalize", modeColor(p.mode))}>
                      {p.mode}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDisconnectId(id);
                      }}
                      className="ml-0.5 p-1 rounded hover:bg-red-900/30 transition-colors cursor-pointer"
                      title={tc("disconnect") + " " + p.label}
                    >
                      <Power className="w-3 h-3 text-neutral-600 hover:text-red-400 transition-colors" />
                    </button>
                  </>
                ) : TRADING_CONNECT_INFO[id] ? (
                  <span className="text-[10px] text-orange-400/70">{tc("connect")}</span>
                ) : (
                  <span className="text-xs text-neutral-600">{tc("notConnected")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {connectInfo && (
        <ConnectDialog
          open={connectId !== null}
          onOpenChange={(open) => !open && setConnectId(null)}
          info={connectInfo}
        />
      )}

      <AlertDialog
        open={disconnectId !== null}
        onOpenChange={(open) => !open && setDisconnectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("disconnectTitle", {
                platform: disconnectId ? platforms[disconnectId]?.label : "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("disconnectDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-600"
              onClick={() => {
                if (disconnectId) {
                  disconnectPlatform(disconnectId);
                }
                setDisconnectId(null);
              }}
            >
              {tc("disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MarketPrices() {
  const { t } = useTranslation("dashboard");
  const [prices, setPrices] = useState<CryptoPrice[]>([]);

  useEffect(() => {
    void fetchCryptoPrices().then(setPrices);
    const interval = setInterval(() => void fetchCryptoPrices().then(setPrices), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (prices.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl glass-panel p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">{t("marketPrices")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {prices.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-1"
          >
            <div className="text-sm font-medium text-neutral-200">
              <span className="font-bold">{p.symbol}</span>
              <span className="text-neutral-500 ml-1.5">{p.name}</span>
            </div>
            <div className="sm:flex sm:items-baseline sm:gap-2">
              <span className="text-sm font-bold font-mono text-neutral-100">
                ${p.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span
                className={cn(
                  "text-xs font-mono ml-2 sm:ml-0",
                  p.change24h >= 0 ? "text-green-400" : "text-red-400",
                )}
              >
                {p.change24h >= 0 ? "+" : ""}
                {p.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const tradingEnabled = useAppStore((s) => s.tradingEnabled);
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const configLoaded = useAppStore((s) => s.configLoaded);
  const channelStatuses = useAppStore((s) => s.channelStatuses);

  const showOnboarding =
    configLoaded && !onboardingComplete && !channelStatuses?.some((c) => c.connected);

  const {
    dailyPnlUsd,
    dailyTradeCount,
    currentPortfolioValueUsd,
    positions,
    killSwitchActive,
    platforms,
  } = useTradingStore();

  // Full-screen onboarding: hide dashboard entirely during setup
  if (showOnboarding) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <OnboardingWizard />
        </div>
      </div>
    );
  }

  const pnlColor = dailyPnlUsd >= 0 ? "text-green-400" : "text-red-400";
  const pnlSign = dailyPnlUsd >= 0 ? "+" : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">{t("title")}</h1>
          <p className="text-sm text-neutral-500 mt-1">{t("subtitle")}</p>
        </div>
        {tradingEnabled && <DataModeSelector />}
      </div>

      {tradingEnabled && killSwitchActive && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 flex items-center gap-3 hover:bg-red-950/40 transition-all duration-300">
          <span className="text-red-400 text-lg">⛔</span>
          <div>
            <div className="text-sm font-semibold text-red-300">{t("killSwitchActive")}</div>
            <div className="text-xs text-red-400/70">{t("killSwitchActiveDesc")}</div>
          </div>
        </div>
      )}

      {/* Quick stats — trading stats only when enabled */}
      {tradingEnabled && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("portfolioValue")}
            value={`$${currentPortfolioValueUsd.toLocaleString()}`}
          />
          <StatCard
            label={t("dailyPnl")}
            value={`${pnlSign}$${Math.abs(dailyPnlUsd).toFixed(2)}`}
            color={pnlColor}
          />
          <StatCard label={t("tradesToday")} value={String(dailyTradeCount)} />
          <StatCard label={t("openPositions")} value={String(positions.length)} />
        </div>
      )}

      {/* Market Prices */}
      <MarketPrices />

      {/* P&L Chart — trading only */}
      {tradingEnabled && <PnlChart />}

      {/* Quick links */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          tradingEnabled ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {tradingEnabled && (
          <NavLink
            to="/trading"
            className="rounded-2xl glass-panel p-5 hover:border-orange-600/50 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
          >
            <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
              {t("tradingHub")}
            </h3>
            <p className="text-xs text-neutral-500 mt-1">{t("tradingHubDesc")}</p>
          </NavLink>
        )}

        <NavLink
          to="/channels"
          className="rounded-2xl glass-panel p-5 hover:border-orange-600/50 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            {t("channels", "Channels")}
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            {t("channelsDesc", "Manage your 40+ messaging integrations")}
          </p>
        </NavLink>

        <NavLink
          to="/security"
          className="rounded-2xl glass-panel p-5 hover:border-orange-600/50 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            {t("security")}
          </h3>
          <p className="text-xs text-neutral-500 mt-1">{t("securityDesc")}</p>
        </NavLink>
      </div>

      {/* Extensions status — trading only */}
      {tradingEnabled && <ExtensionsGrid platforms={platforms} />}

      {/* Platform API details — trading only */}
      {tradingEnabled && <PlatformApiInfo platforms={platforms} />}
    </div>
  );
}
