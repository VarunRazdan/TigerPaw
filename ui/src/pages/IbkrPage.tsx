import { useState } from "react";
import { ConnectDialog } from "@/components/ConnectDialog";
import { OrderEntryForm } from "@/components/OrderEntryForm";
import { TradingViewChart } from "@/components/TradingViewChart";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_POSITIONS = [
  {
    symbol: "AAPL",
    description: "Apple Inc",
    qty: 100,
    avgCost: 172.5,
    marketPrice: 178.3,
    pnl: 580,
    currency: "USD",
  },
  {
    symbol: "SPY",
    description: "SPDR S&P 500 ETF",
    qty: 50,
    avgCost: 510.2,
    marketPrice: 515.8,
    pnl: 280,
    currency: "USD",
  },
  {
    symbol: "MSFT 240621C00420000",
    description: "MSFT Jun 420 Call",
    qty: 5,
    avgCost: 8.5,
    marketPrice: 12.2,
    pnl: 185,
    currency: "USD",
  },
];

export function IbkrPage() {
  const platform = useTradingStore((s) => s.platforms.ibkr);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icons/trading-platforms/interactive-brokers.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Interactive Brokers</h1>
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
          {platform?.mode === "live" ? "Live" : "Paper"}
        </Badge>
      </div>
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        info={TRADING_CONNECT_INFO.ibkr}
      />

      {/* TradingView Chart */}
      <TradingViewChart symbol="NASDAQ:AAPL" height={380} />

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">Net Liq. Value</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$125,400</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">Buying Power</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$250,800</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">Margin Used</div>
          <div className="text-lg font-bold font-mono text-amber-400">$18,200</div>
        </div>
        <div className="rounded-2xl glass-panel px-3 py-3.5">
          <div className="text-xs text-neutral-500">Daily P&L</div>
          <div className="text-lg font-bold font-mono text-green-400">+$1,045</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="positions">
              <div className="rounded-2xl glass-panel overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-neutral-500 border-b border-[var(--glass-subtle-hover)]">
                      <th className="py-2 px-3 text-left font-medium">Symbol</th>
                      <th className="py-2 px-3 text-left font-medium">Description</th>
                      <th className="py-2 px-3 text-right font-medium">Qty</th>
                      <th className="py-2 px-3 text-right font-medium">Avg Cost</th>
                      <th className="py-2 px-3 text-right font-medium">Market</th>
                      <th className="py-2 px-3 text-right font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_POSITIONS.map((pos) => (
                      <tr
                        key={pos.symbol}
                        className="text-xs border-b border-[var(--glass-divider)] hover:bg-[var(--glass-divider)] transition-colors duration-200"
                      >
                        <td className="py-2 px-3 font-medium text-neutral-200">{pos.symbol}</td>
                        <td className="py-2 px-3 text-neutral-400">{pos.description}</td>
                        <td className="py-2 px-3 text-right font-mono text-neutral-300">
                          {pos.qty}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-neutral-400">
                          ${pos.avgCost.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-neutral-200">
                          ${pos.marketPrice.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 text-right font-mono font-semibold",
                            pos.pnl >= 0 ? "text-green-400" : "text-red-400",
                          )}
                        >
                          {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

        <OrderEntryForm extensionId="ibkr" defaultSymbol="AAPL" priceEstimate={178} />
      </div>
    </div>
  );
}
