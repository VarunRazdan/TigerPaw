import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_MARKETS = [
  {
    question: "Will BTC exceed $100K by end of Q1?",
    yesPrice: 0.62,
    volume: "$1.2M",
    endDate: "Mar 31",
  },
  {
    question: "Will the Fed cut rates in March?",
    yesPrice: 0.23,
    volume: "$890K",
    endDate: "Mar 19",
  },
  {
    question: "Will AI replace 10% of US jobs by 2027?",
    yesPrice: 0.41,
    volume: "$2.1M",
    endDate: "Dec 31",
  },
  {
    question: "Will SpaceX reach Mars by 2028?",
    yesPrice: 0.08,
    volume: "$450K",
    endDate: "Dec 31",
  },
];

function MarketCard({ market }: { market: (typeof DEMO_MARKETS)[0] }) {
  const yesPct = Math.round(market.yesPrice * 100);
  const noPct = 100 - yesPct;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 hover:border-neutral-700 transition-colors">
      <div className="text-sm font-medium text-neutral-200 mb-2">{market.question}</div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-neutral-800 flex">
          <div className="bg-green-500 h-full" style={{ width: `${yesPct}%` }} />
          <div className="bg-red-500 h-full" style={{ width: `${noPct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3">
          <span className="text-green-400">YES {yesPct}c</span>
          <span className="text-red-400">NO {noPct}c</span>
        </div>
        <span className="text-neutral-500">
          {market.volume} · Ends {market.endDate}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="px-3 py-1.5 rounded text-xs font-semibold bg-green-800 hover:bg-green-700 text-green-100 transition-colors">
          Buy YES
        </button>
        <button className="px-3 py-1.5 rounded text-xs font-semibold bg-red-800 hover:bg-red-700 text-red-100 transition-colors">
          Buy NO
        </button>
      </div>
    </div>
  );
}

export function PolymarketPage() {
  const positions = useTradingStore((s) => s.positions).filter(
    (p) => p.extensionId === "polymarket",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-100">Polymarket</h1>
        <Badge variant="success">Connected</Badge>
      </div>

      <Tabs defaultValue="markets">
        <TabsList>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="positions">
            My Positions
            {positions.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-neutral-700 text-neutral-300">
                {positions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="markets">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEMO_MARKETS.map((market) => (
              <MarketCard key={market.question} market={market} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="positions">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            {positions.length === 0 ? (
              <p className="text-xs text-neutral-600 py-4 text-center">No open positions</p>
            ) : (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div
                    key={pos.symbol}
                    className="flex items-center justify-between py-2 border-b border-neutral-800/50 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{pos.symbol}</div>
                      <div className="text-xs text-neutral-500">{pos.quantity} shares</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-neutral-300">
                        ${pos.valueUsd.toFixed(2)}
                      </div>
                      <div
                        className={cn(
                          "text-xs font-mono",
                          pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400",
                        )}
                      >
                        {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                      </div>
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
              Order history loads from audit log
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
