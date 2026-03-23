import { useState, useEffect } from "react";
import { ConnectDialog } from "@/components/ConnectDialog";
import { OrderEntryForm } from "@/components/OrderEntryForm";
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
              : "bg-white/[0.06] text-neutral-400 border-white/[0.08] cursor-pointer hover:bg-white/[0.10] hover:text-orange-400"
          }
          onClick={() => !platform?.connected && setConnectOpen(true)}
        >
          {platform?.connected ? "Connected" : "Not Connected — Click to Setup"}
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
            <div
              key={p.id}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 px-3 py-3.5"
            >
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
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 px-3 py-3.5">
          <div className="text-xs text-neutral-500">Total Balance</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$33,353</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 px-3 py-3.5">
          <div className="text-xs text-neutral-500">BTC Price</div>
          <div className="text-lg font-bold font-mono text-orange-400">$68,240</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 px-3 py-3.5">
          <div className="text-xs text-neutral-500">Open Orders</div>
          <div className="text-lg font-bold font-mono text-neutral-100">2</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Tabs defaultValue="balances">
            <TabsList>
              <TabsTrigger value="balances">Balances</TabsTrigger>
              <TabsTrigger value="orders">Open Orders</TabsTrigger>
              <TabsTrigger value="history">Trade History</TabsTrigger>
            </TabsList>

            <TabsContent value="balances">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30">
                {DEMO_BALANCES.map((bal) => (
                  <div
                    key={bal.asset}
                    className="flex items-center justify-between p-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{bal.asset}</div>
                      <div className="text-xs text-neutral-500">
                        Free: {bal.free}
                        {parseFloat(bal.locked.replace(/,/g, "")) > 0 && ` | Locked: ${bal.locked}`}
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
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
                <p className="text-xs text-neutral-600 py-4 text-center">
                  No open orders on testnet
                </p>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
                <p className="text-xs text-neutral-600 py-4 text-center">
                  Trade history loads from audit log
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <OrderEntryForm extensionId="binance" defaultSymbol="BTCUSDT" priceEstimate={68240} />
      </div>
    </div>
  );
}
