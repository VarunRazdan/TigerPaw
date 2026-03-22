import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-100">Coinbase</h1>
        <Badge
          className={
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-neutral-800 text-neutral-400 border-neutral-700"
          }
        >
          {platform?.connected ? "Connected" : "Not Connected"}
        </Badge>
        <Badge className="bg-blue-900 text-blue-300 border-blue-800">
          {platform?.mode === "live" ? "Live" : "Sandbox"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Total Balance</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$34,962.00</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">24h Change</div>
          <div className="text-lg font-bold font-mono text-green-400">+$312.40</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Assets</div>
          <div className="text-lg font-bold font-mono text-neutral-100">{DEMO_ASSETS.length}</div>
        </div>
      </div>

      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50">
            {DEMO_ASSETS.map((asset) => (
              <div
                key={asset.asset}
                className="flex items-center justify-between p-3 border-b border-neutral-800/50 last:border-0"
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
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">No open orders</p>
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
