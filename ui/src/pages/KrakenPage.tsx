import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_BALANCES = [
  { asset: "XXBT", name: "Bitcoin", balance: "0.3200", valueUsd: 21837 },
  { asset: "XETH", name: "Ethereum", balance: "8.500", valueUsd: 16150 },
  { asset: "ZUSD", name: "US Dollar", balance: "5,430.00", valueUsd: 5430 },
  { asset: "XXRP", name: "Ripple", balance: "12,000", valueUsd: 6000 },
];

export function KrakenPage() {
  const platform = useTradingStore((s) => s.platforms.kraken);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-100">Kraken</h1>
        <Badge
          className={
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-neutral-800 text-neutral-400 border-neutral-700"
          }
        >
          {platform?.connected ? "Connected" : "Not Connected"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Total Balance</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$49,417</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Trade Volume (30d)</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$12,340</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-xs text-neutral-500">Open Positions</div>
          <div className="text-lg font-bold font-mono text-neutral-100">0</div>
        </div>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="orders">Open Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="balances">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50">
            {DEMO_BALANCES.map((bal) => (
              <div
                key={bal.asset}
                className="flex items-center justify-between p-3 border-b border-neutral-800/50 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-200">{bal.name}</div>
                  <div className="text-xs text-neutral-500">
                    {bal.asset} — {bal.balance}
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
