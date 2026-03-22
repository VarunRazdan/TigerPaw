import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_BALANCES = [
  { asset: "BTC", free: "0.1520", locked: "0.0000", valueUsd: 10373 },
  { asset: "ETH", free: "5.200", locked: "1.000", valueUsd: 11780 },
  { asset: "BNB", free: "12.50", locked: "0.00", valueUsd: 7500 },
  { asset: "USDT", free: "3,200.00", locked: "500.00", valueUsd: 3700 },
];

export function BinancePage() {
  const platform = useTradingStore((s) => s.platforms.binance);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-100">Binance</h1>
        <Badge
          className={
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-neutral-800 text-neutral-400 border-neutral-700"
          }
        >
          {platform?.connected ? "Connected" : "Not Connected"}
        </Badge>
        <Badge className="bg-yellow-900 text-yellow-300 border-yellow-800">
          {platform?.mode === "live" ? "Live" : "Testnet"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Total Balance</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$33,353</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">BTC Price</div>
          <div className="text-lg font-bold font-mono text-orange-400">$68,240</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Open Orders</div>
          <div className="text-lg font-bold font-mono text-neutral-100">2</div>
        </div>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="orders">Open Orders</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
        </TabsList>

        <TabsContent value="balances">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50">
            {DEMO_BALANCES.map((bal) => (
              <div
                key={bal.asset}
                className="flex items-center justify-between p-3 border-b border-neutral-800/50 last:border-0"
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
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">No open orders on testnet</p>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">
              Trade history loads from audit log
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
