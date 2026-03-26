import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ConnectDialog } from "@/components/ConnectDialog";
import { OrderEntrySheet } from "@/components/OrderEntrySheet";
import { TradingViewChart } from "@/components/TradingViewChart";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCryptoPrices, type CryptoPrice } from "@/lib/coingecko";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_BALANCES = [
  { asset: "BTC", free: "0.1520", locked: "0.0000", valueUsd: 10373 },
  { asset: "ETH", free: "5.200", locked: "1.000", valueUsd: 11780 },
  { asset: "BNB", free: "12.50", locked: "0.00", valueUsd: 7500 },
  { asset: "USDT", free: "3,200.00", locked: "500.00", valueUsd: 3700 },
];

export function BinancePage() {
  const { t } = useTranslation("platforms");
  const { t: tc } = useTranslation("common");
  const platform = useTradingStore((s) => s.platforms.binance);
  const [connectOpen, setConnectOpen] = useState(false);
  const [prices, setPrices] = useState<CryptoPrice[]>([]);

  useEffect(() => {
    fetchCryptoPrices().then(setPrices);
    const interval = setInterval(() => fetchCryptoPrices().then(setPrices), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icons/trading-platforms/binance.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Binance</h1>
        <Badge
          className={
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-[var(--glass-subtle-hover)] text-neutral-400 border-[var(--glass-subtle-hover)] cursor-pointer hover:bg-[var(--glass-border)] hover:text-orange-400"
          }
          onClick={() => !platform?.connected && setConnectOpen(true)}
        >
          {platform?.connected ? tc("connected") : tc("notConnected")}
        </Badge>
        <Badge className="bg-yellow-900 text-yellow-300 border-yellow-800">
          {platform?.mode === "live" ? "Live" : "Testnet"}
        </Badge>
      </div>
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        info={TRADING_CONNECT_INFO.binance}
      />

      {/* Live Crypto Prices */}
      {prices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {prices.map((p) => (
            <div key={p.id} className="rounded-2xl glass-panel px-3 py-3.5">
              <div className="text-xs text-neutral-500">{p.symbol}</div>
              <div className="text-lg font-bold font-mono text-neutral-100">
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
          ))}
        </div>
      )}

      {/* TradingView Chart */}
      <TradingViewChart symbol="BINANCE:BTCUSDT" height={380} />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("totalBalance")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$33,353</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("btcPrice")}</div>
          <div className="text-lg font-bold font-mono text-orange-400">$68,240</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">{t("openOrders")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">2</div>
        </div>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">{t("balances")}</TabsTrigger>
          <TabsTrigger value="orders">{t("openOrders")}</TabsTrigger>
          <TabsTrigger value="history">{t("tradeHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="balances">
          <div className="rounded-2xl glass-panel">
            {DEMO_BALANCES.map((bal) => (
              <div
                key={bal.asset}
                className="flex items-center justify-between p-3 border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-divider)] transition-colors duration-200 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-200">{bal.asset}</div>
                  <div className="text-xs text-neutral-500">
                    {tc("free")}: {bal.free}
                    {parseFloat(bal.locked.replace(/,/g, "")) > 0 &&
                      ` | ${tc("locked")}: ${bal.locked}`}
                  </div>
                </div>
                <div className="text-sm font-mono text-neutral-200">
                  ${bal.valueUsd.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="rounded-2xl glass-panel p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">{t("noOpenOrders")}</p>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-2xl glass-panel p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">
              {tc("tradeHistoryAuditLog")}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <OrderEntrySheet extensionId="binance" defaultSymbol="BTCUSDT" priceEstimate={68240} />
    </div>
  );
}
