import { Power } from "lucide-react";
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ConnectDialog } from "@/components/ConnectDialog";
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
      <div className={cn("text-2xl font-bold font-mono", color ?? "text-neutral-100")}>{value}</div>
      {subtext && <div className="text-xs text-neutral-500 mt-1">{subtext}</div>}
    </div>
  );
}

function modeColor(mode: string): string {
  switch (mode) {
    case "live":
    case "mainnet":
      return "text-green-400";
    case "paper":
      return "text-blue-400";
    case "demo":
    case "sandbox":
    case "testnet":
      return "text-amber-400";
    case "play":
      return "text-purple-400";
    default:
      return "text-neutral-600";
  }
}

function modeDot(mode: string): string {
  switch (mode) {
    case "live":
      return "bg-green-400";
    case "paper":
      return "bg-blue-400";
    case "demo":
      return "bg-amber-400";
    case "play":
      return "bg-purple-400";
    default:
      return "bg-neutral-600";
  }
}

function ExtensionsGrid({
  platforms,
}: {
  platforms: Record<string, { label: string; connected: boolean; mode: string }>;
}) {
  const [connectId, setConnectId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const connectInfo = connectId ? TRADING_CONNECT_INFO[connectId] : null;
  const disconnectPlatform = useTradingStore((s) => s.disconnectPlatform);

  return (
    <>
      <div className="rounded-2xl glass-panel p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Trading Extensions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                      title={`Disconnect ${p.label}`}
                    >
                      <Power className="w-3 h-3 text-neutral-600 hover:text-red-400 transition-colors" />
                    </button>
                  </>
                ) : TRADING_CONNECT_INFO[id] ? (
                  <span className="text-[10px] text-orange-400/70">Connect</span>
                ) : (
                  <span className="text-xs text-neutral-600">not connected</span>
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
              Disconnect {disconnectId ? platforms[disconnectId]?.label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all trading on this platform. Open positions will not be automatically
              closed. You can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-600"
              onClick={() => {
                if (disconnectId) {
                  disconnectPlatform(disconnectId);
                }
                setDisconnectId(null);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MarketPrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);

  useEffect(() => {
    fetchCryptoPrices().then(setPrices);
    const interval = setInterval(() => fetchCryptoPrices().then(setPrices), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (prices.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl glass-panel p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Market Prices</h3>
      <div className="grid grid-cols-3 gap-4">
        {prices.map((p) => (
          <div key={p.id} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-neutral-200">
                <span className="font-bold">{p.symbol}</span>
                <span className="text-neutral-500 ml-1.5">{p.name}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold font-mono text-neutral-100">
                ${p.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div
                className={cn(
                  "text-xs font-mono",
                  p.change24h >= 0 ? "text-green-400" : "text-red-400",
                )}
              >
                {p.change24h >= 0 ? "+" : ""}
                {p.change24h.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const {
    dailyPnlUsd,
    dailyTradeCount,
    currentPortfolioValueUsd,
    positions,
    killSwitchActive,
    platforms,
    demoMode,
  } = useTradingStore();

  const pnlColor = dailyPnlUsd >= 0 ? "text-green-400" : "text-red-400";
  const pnlSign = dailyPnlUsd >= 0 ? "+" : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Tigerpaw Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-1">Your AI trades. You decide.</p>
        </div>
        {demoMode && (
          <NavLink
            to="/trading/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-700/50 bg-amber-950/30 text-amber-400 text-xs font-medium hover:bg-amber-950/50 transition-all duration-200 cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Demo Data
          </NavLink>
        )}
      </div>

      {killSwitchActive && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 flex items-center gap-3 hover:bg-red-950/40 transition-all duration-300">
          <span className="text-red-400 text-lg">⛔</span>
          <div>
            <div className="text-sm font-semibold text-red-300">Kill Switch Active</div>
            <div className="text-xs text-red-400/70">
              All trading is halted. Go to Trading Hub to resume.
            </div>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Portfolio Value" value={`$${currentPortfolioValueUsd.toLocaleString()}`} />
        <StatCard
          label="Daily P&L"
          value={`${pnlSign}$${Math.abs(dailyPnlUsd).toFixed(2)}`}
          color={pnlColor}
        />
        <StatCard label="Trades Today" value={String(dailyTradeCount)} />
        <StatCard label="Open Positions" value={String(positions.length)} />
      </div>

      {/* Market Prices */}
      <MarketPrices />

      {/* P&L Chart */}
      <PnlChart />

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NavLink
          to="/trading"
          className="rounded-2xl glass-panel p-5 hover:border-orange-600/50 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            Trading Hub →
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Risk dashboard, approval queue, positions, and trade history
          </p>
        </NavLink>

        <NavLink
          to="/trading/settings"
          className="rounded-2xl glass-panel p-5 hover:border-orange-600/50 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            Risk Settings →
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Configure risk tiers, approval modes, and position limits
          </p>
        </NavLink>

        <NavLink
          to="/security"
          className="rounded-2xl glass-panel p-5 hover:border-orange-600/50 transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            Security →
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Security audit, credential status, and extension permissions
          </p>
        </NavLink>
      </div>

      {/* Extensions status */}
      <ExtensionsGrid platforms={platforms} />

      {/* Platform API details (toggleable) */}
      <PlatformApiInfo platforms={platforms} />
    </div>
  );
}
