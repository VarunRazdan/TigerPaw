import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

function AccountCard() {
  const { currentPortfolioValueUsd } = useTradingStore();
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
    <tr className="text-xs border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
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

function OrderEntryPanel() {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Place Order</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Symbol</label>
          <input
            type="text"
            placeholder="AAPL"
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 rounded text-sm font-semibold bg-green-800 hover:bg-green-700 text-green-100 transition-colors">
            BUY
          </button>
          <button className="px-3 py-2 rounded text-sm font-semibold bg-red-800 hover:bg-red-700 text-red-100 transition-colors">
            SELL
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Quantity</label>
            <input
              type="number"
              placeholder="1"
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Order Type</label>
            <select className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none">
              <option>Market</option>
              <option>Limit</option>
              <option>Stop</option>
              <option>Stop Limit</option>
              <option>Trailing Stop</option>
            </select>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Stop Loss</label>
            <input
              type="number"
              placeholder="--"
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Take Profit</label>
            <input
              type="number"
              placeholder="--"
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>
        <button className="w-full px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">
          Submit Order
        </button>
        <p className="text-[10px] text-neutral-600 text-center">
          All orders are policy-gated and require pre-trade approval
        </p>
      </div>
    </div>
  );
}

export function AlpacaPage() {
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "alpaca");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-100">Alpaca</h1>
        <Badge variant="success">Connected</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <AccountCard />

          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Order History</TabsTrigger>
            </TabsList>
            <TabsContent value="positions">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                {positions.length === 0 ? (
                  <p className="text-xs text-neutral-600 py-4 text-center">No open positions</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-neutral-500 border-b border-neutral-800">
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
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                <p className="text-xs text-neutral-600 py-4 text-center">
                  Order history loads from audit log
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <OrderEntryPanel />
      </div>
    </div>
  );
}
