import { useState } from "react";
import { ConnectDialog } from "@/components/ConnectDialog";
import { OrderEntryForm } from "@/components/OrderEntryForm";
import { TradingViewChart } from "@/components/TradingViewChart";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

function AccountCard() {
  const { currentPortfolioValueUsd } = useTradingStore();
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">Account</h3>
        <Badge variant="secondary">Paper</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-neutral-500">Equity</div>
          <div className="text-lg font-bold font-mono text-neutral-100">
            ${currentPortfolioValueUsd.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Buying Power</div>
          <div className="text-lg font-bold font-mono text-neutral-100">
            ${(currentPortfolioValueUsd * 4).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Day Trades (5d)</div>
          <div className="text-sm font-mono text-neutral-300">2 / 3</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">PDT Status</div>
          <div className="text-sm text-green-400">OK</div>
        </div>
      </div>
    </div>
  );
}

function PositionRow({
  symbol,
  qty,
  avgEntry,
  current,
  pnl,
}: {
  symbol: string;
  qty: number;
  avgEntry: number;
  current: number;
  pnl: number;
}) {
  return (
    <tr className="text-xs border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors duration-200">
      <td className="py-2 pr-2 font-medium text-neutral-200">{symbol}</td>
      <td className="py-2 pr-2 text-neutral-400 font-mono text-right">{qty}</td>
      <td className="py-2 pr-2 text-neutral-400 font-mono text-right">${avgEntry.toFixed(2)}</td>
      <td className="py-2 pr-2 text-neutral-300 font-mono text-right">${current.toFixed(2)}</td>
      <td className={cn("py-2 font-mono text-right", pnl >= 0 ? "text-green-400" : "text-red-400")}>
        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
      </td>
    </tr>
  );
}

export function AlpacaPage() {
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "alpaca");
  const platform = useTradingStore((s) => s.platforms.alpaca);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icons/trading-platforms/alpaca.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Alpaca</h1>
        <Badge
          className={cn(
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-white/[0.06] text-neutral-400 border-white/[0.08] cursor-pointer hover:bg-white/[0.10] hover:text-orange-400",
          )}
          onClick={() => !platform?.connected && setConnectOpen(true)}
        >
          {platform?.connected ? "Connected" : "Not Connected — Click to Setup"}
        </Badge>
      </div>
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        info={TRADING_CONNECT_INFO.alpaca}
      />

      {/* TradingView Chart — shows first held position's symbol, fallback AAPL */}
      <TradingViewChart
        symbol={`NASDAQ:${positions.length > 0 ? positions[0].symbol : "AAPL"}`}
        height={380}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <AccountCard />

          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Order History</TabsTrigger>
            </TabsList>
            <TabsContent value="positions">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
                {positions.length === 0 ? (
                  <p className="text-xs text-neutral-600 py-4 text-center">No open positions</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-neutral-500 border-b border-white/[0.08]">
                        <th className="py-1.5 pr-2 text-left font-medium">Symbol</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Avg Entry</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Current</th>
                        <th className="py-1.5 text-right font-medium">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <PositionRow
                          key={p.symbol}
                          symbol={p.symbol}
                          qty={p.quantity}
                          avgEntry={p.valueUsd / p.quantity - p.unrealizedPnl / p.quantity}
                          current={p.valueUsd / p.quantity}
                          pnl={p.unrealizedPnl}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </TabsContent>
            <TabsContent value="orders">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
                <p className="text-xs text-neutral-600 py-4 text-center">
                  Order history loads from audit log
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <OrderEntryForm extensionId="alpaca" defaultSymbol="AAPL" priceEstimate={219} />
      </div>
    </div>
  );
}
