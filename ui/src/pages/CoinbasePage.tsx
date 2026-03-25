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

const DEMO_ASSETS = [
  { asset: "BTC", name: "Bitcoin", free: "0.2451", value: 16742, change: 2.3 },
  { asset: "ETH", name: "Ethereum", free: "3.800", value: 7220, change: -0.8 },
  { asset: "SOL", name: "Solana", free: "45.0", value: 6750, change: 5.1 },
  { asset: "USD", name: "US Dollar", free: "4,250.00", value: 4250, change: 0 },
];

export function CoinbasePage() {
  const platform = useTradingStore((s) => s.platforms.coinbase);
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
        <img src="/icons/trading-platforms/coinbase.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Coinbase</h1>
        <Badge
          className={cn(
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-[var(--glass-subtle-hover)] text-neutral-400 border-[var(--glass-subtle-hover)] cursor-pointer hover:bg-[var(--glass-border)] hover:text-orange-400",
          )}
          onClick={() => !platform?.connected && setConnectOpen(true)}
        >
          {platform?.connected ? "Connected" : "Not Connected — Click to Setup"}
        </Badge>
        <Badge className="bg-blue-900 text-blue-300 border-blue-800">
          {platform?.mode === "live" ? "Live" : "Sandbox"}
        </Badge>
      </div>
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        info={TRADING_CONNECT_INFO.coinbase}
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
      <TradingViewChart symbol="COINBASE:BTCUSD" height={380} />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">Total Balance</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$34,962.00</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">24h Change</div>
          <div className="text-lg font-bold font-mono text-green-400">+$312.40</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">Assets</div>
          <div className="text-lg font-bold font-mono text-neutral-100">{DEMO_ASSETS.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Tabs defaultValue="holdings">
            <TabsList>
              <TabsTrigger value="holdings">Holdings</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="holdings">
              <div className="rounded-2xl glass-panel">
                {DEMO_ASSETS.map((asset) => (
                  <div
                    key={asset.asset}
                    className="flex items-center justify-between p-3 border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-divider)] transition-colors duration-200 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{asset.asset}</div>
                      <div className="text-xs text-neutral-500">
                        {asset.name} — {asset.free}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-neutral-200">
                        ${asset.value.toLocaleString()}
                      </div>
                      <div
                        className={cn(
                          "text-xs font-mono",
                          asset.change > 0
                            ? "text-green-400"
                            : asset.change < 0
                              ? "text-red-400"
                              : "text-neutral-500",
                        )}
                      >
                        {asset.change > 0 ? "+" : ""}
                        {asset.change}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="orders">
              <div className="rounded-2xl glass-panel p-4">
                <p className="text-xs text-neutral-600 py-4 text-center">No open orders</p>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <div className="rounded-2xl glass-panel p-4">
                <p className="text-xs text-neutral-600 py-4 text-center">
                  Trade history loads from audit log
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <OrderEntryForm extensionId="coinbase" defaultSymbol="BTC-USD" priceEstimate={68240} />
      </div>
    </div>
  );
}
