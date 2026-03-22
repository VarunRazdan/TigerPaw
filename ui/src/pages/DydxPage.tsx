import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_MARKETS = [
  { market: "BTC-USD", price: "$68,240", change: "+2.1%", volume: "$1.2B", funding: "+0.012%" },
  { market: "ETH-USD", price: "$1,900", change: "-0.4%", volume: "$680M", funding: "+0.008%" },
  { market: "SOL-USD", price: "$150.20", change: "+5.3%", volume: "$340M", funding: "+0.015%" },
  { market: "DOGE-USD", price: "$0.1042", change: "-1.2%", volume: "$85M", funding: "-0.003%" },
];

export function DydxPage() {
  const platform = useTradingStore((s) => s.platforms.dydx);
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "dydx");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-100">dYdX</h1>
        <Badge
          className={
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-neutral-800 text-neutral-400 border-neutral-700"
          }
        >
          {platform?.connected ? "Connected" : "Not Connected"}
        </Badge>
        <Badge className="bg-indigo-900 text-indigo-300 border-indigo-800">
          {platform?.mode === "live" ? "Mainnet" : "Testnet"}
        </Badge>
        <Badge className="bg-neutral-800 text-neutral-400 border-neutral-700">Perpetuals</Badge>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Equity</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$15,200</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Free Collateral</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$8,400</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Open Positions</div>
          <div className="text-lg font-bold font-mono text-neutral-100">{positions.length}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Unrealized P&L</div>
          <div className="text-lg font-bold font-mono text-green-400">+$420</div>
        </div>
      </div>

      <Tabs defaultValue="markets">
        <TabsList>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="history">Fills</TabsTrigger>
        </TabsList>

        <TabsContent value="markets">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                  <th className="py-2 px-3 text-left font-medium">Market</th>
                  <th className="py-2 px-3 text-right font-medium">Price</th>
                  <th className="py-2 px-3 text-right font-medium">24h Change</th>
                  <th className="py-2 px-3 text-right font-medium">Volume</th>
                  <th className="py-2 px-3 text-right font-medium">Funding</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_MARKETS.map((m) => (
                  <tr
                    key={m.market}
                    className="text-xs border-b border-neutral-800/50 hover:bg-neutral-800/30"
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
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            {positions.length === 0 ? (
              <p className="text-xs text-neutral-600 py-4 text-center">
                No open perpetual positions
              </p>
            ) : (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div
                    key={pos.symbol}
                    className="flex items-center justify-between py-2 border-b border-neutral-800/50 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{pos.symbol}</div>
                      <div className="text-xs text-neutral-500">{pos.quantity} contracts</div>
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
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">
              Fill history loads from audit log
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
