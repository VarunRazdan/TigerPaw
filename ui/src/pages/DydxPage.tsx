import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectDialog } from "@/components/ConnectDialog";
import { OrderEntrySheet } from "@/components/OrderEntrySheet";
import { TradingViewChart } from "@/components/TradingViewChart";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_MARKETS = [
  { market: "BTC-USD", price: "$68,240", change: "+2.1%", volume: "$1.2B", funding: "+0.012%" },
  { market: "ETH-USD", price: "$1,900", change: "-0.4%", volume: "$680M", funding: "+0.008%" },
  { market: "SOL-USD", price: "$150.20", change: "+5.3%", volume: "$340M", funding: "+0.015%" },
  { market: "DOGE-USD", price: "$0.1042", change: "-1.2%", volume: "$85M", funding: "-0.003%" },
];

export function DydxPage() {
  const { t } = useTranslation("platforms");
  const { t: tc } = useTranslation("common");
  const platform = useTradingStore((s) => s.platforms.dydx);
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "dydx");
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icons/trading-platforms/dydx.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">dYdX</h1>
        <Badge
          className={cn(
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-[var(--glass-subtle-hover)] text-neutral-400 border-[var(--glass-subtle-hover)] cursor-pointer hover:bg-[var(--glass-border)] hover:text-orange-400",
          )}
          onClick={() => !platform?.connected && setConnectOpen(true)}
        >
          {platform?.connected ? tc("connected") : tc("notConnected")}
        </Badge>
        <Badge className="bg-indigo-900 text-indigo-300 border-indigo-800">
          {platform?.mode === "live" ? "Mainnet" : "Testnet"}
        </Badge>
        <Badge className="bg-[var(--glass-subtle-hover)] text-neutral-400 border-[var(--glass-subtle-hover)]">
          {t("perpetuals")}
        </Badge>
      </div>
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        info={TRADING_CONNECT_INFO.dydx}
      />

      {/* Order placement warning */}
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
        <span className="text-amber-500 mt-0.5">⚠</span>
        <span>{t("dydxOrderWarning")}</span>
      </div>

      {/* TradingView Chart */}
      <TradingViewChart symbol="BINANCE:BTCUSDT" height={380} />

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("equity")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$15,200</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("freeCollateral")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$8,400</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("openPositions")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">{positions.length}</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("unrealizedPnl")}</div>
          <div className="text-lg font-bold font-mono text-green-400">+$420</div>
        </div>
      </div>

      <Tabs defaultValue="markets">
        <TabsList>
          <TabsTrigger value="markets">{t("markets")}</TabsTrigger>
          <TabsTrigger value="positions">{t("positions")}</TabsTrigger>
          <TabsTrigger value="history">{t("fills")}</TabsTrigger>
        </TabsList>

        <TabsContent value="markets">
          <div className="rounded-2xl glass-panel overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-neutral-500 border-b border-[var(--glass-subtle-hover)]">
                  <th className="py-2 px-3 text-left font-medium">{tc("market")}</th>
                  <th className="py-2 px-3 text-right font-medium">{tc("price")}</th>
                  <th className="py-2 px-3 text-right font-medium">{t("change24h")}</th>
                  <th className="py-2 px-3 text-right font-medium">{tc("volume")}</th>
                  <th className="py-2 px-3 text-right font-medium">{tc("funding")}</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_MARKETS.map((m) => (
                  <tr
                    key={m.market}
                    className="text-xs border-b border-[var(--glass-divider)] hover:bg-[var(--glass-divider)] transition-colors duration-200"
                  >
                    <td className="py-2 px-3 font-medium text-neutral-200">{m.market}</td>
                    <td className="py-2 px-3 text-right font-mono text-neutral-200">{m.price}</td>
                    <td
                      className={cn(
                        "py-2 px-3 text-right font-mono",
                        m.change.startsWith("+") ? "text-green-400" : "text-red-400",
                      )}
                    >
                      {m.change}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-neutral-400">{m.volume}</td>
                    <td
                      className={cn(
                        "py-2 px-3 text-right font-mono",
                        m.funding.startsWith("+") ? "text-green-400" : "text-red-400",
                      )}
                    >
                      {m.funding}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="positions">
          <div className="rounded-2xl glass-panel p-4">
            {positions.length === 0 ? (
              <p className="text-xs text-neutral-600 py-4 text-center">{t("noOpenPerps")}</p>
            ) : (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div
                    key={pos.symbol}
                    className="flex items-center justify-between py-2 border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-divider)] transition-colors duration-200 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{pos.symbol}</div>
                      <div className="text-xs text-neutral-500">
                        {pos.quantity} {t("contracts")}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-sm font-mono",
                        pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400",
                      )}
                    >
                      {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-2xl glass-panel p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">{tc("fillHistoryAuditLog")}</p>
          </div>
        </TabsContent>
      </Tabs>

      <OrderEntrySheet extensionId="dydx" defaultSymbol="BTC-USD" priceEstimate={68240} />
    </div>
  );
}
