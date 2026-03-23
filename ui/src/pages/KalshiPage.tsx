import { useState } from "react";
import { ConnectDialog } from "@/components/ConnectDialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_EVENTS = [
  { title: "Fed Funds Rate March 2026", series: "FOMC", yesPrice: 23, contracts: 1240 },
  { title: "GDP Q1 2026 > 2%", series: "Economics", yesPrice: 67, contracts: 890 },
  { title: "S&P 500 > 6000 by April", series: "Markets", yesPrice: 54, contracts: 3200 },
  { title: "CPI March 2026 < 3%", series: "Economics", yesPrice: 78, contracts: 560 },
];

function EventCard({ event }: { event: (typeof DEMO_EVENTS)[0] }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4 transition-all duration-300">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-[10px]">
          {event.series}
        </Badge>
      </div>
      <div className="text-sm font-medium text-neutral-200 mb-3">{event.title}</div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-neutral-500">YES</div>
            <div className="text-lg font-bold font-mono text-green-400">{event.yesPrice}c</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">NO</div>
            <div className="text-lg font-bold font-mono text-red-400">{100 - event.yesPrice}c</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">Contracts</div>
          <div className="text-sm font-mono text-neutral-400">
            {event.contracts.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="px-3 py-1.5 rounded text-xs font-semibold bg-green-800 hover:bg-green-700 hover:-translate-y-0.5 hover:scale-105 text-green-100 cursor-pointer transition-all duration-300 hover:shadow-md">
          Buy YES
        </button>
        <button className="px-3 py-1.5 rounded text-xs font-semibold bg-red-800 hover:bg-red-700 hover:-translate-y-0.5 hover:scale-105 text-red-100 cursor-pointer transition-all duration-300 hover:shadow-md">
          Buy NO
        </button>
      </div>
    </div>
  );
}

export function KalshiPage() {
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "kalshi");
  const platform = useTradingStore((s) => s.platforms.kalshi);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icons/trading-platforms/kalshi.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Kalshi</h1>
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
        info={TRADING_CONNECT_INFO.kalshi}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-3">
          <div className="text-xs text-neutral-500">Balance</div>
          <div className="text-lg font-bold font-mono text-neutral-100">$500.00</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-3">
          <div className="text-xs text-neutral-500">Positions</div>
          <div className="text-lg font-bold font-mono text-neutral-100">{positions.length}</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-3">
          <div className="text-xs text-neutral-500">Pending Payouts</div>
          <div className="text-lg font-bold font-mono text-green-400">$84.00</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-3">
          <div className="text-xs text-neutral-500">Total P&L</div>
          <div className="text-lg font-bold font-mono text-red-400">-$29.60</div>
        </div>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="positions">My Positions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEMO_EVENTS.map((event) => (
              <EventCard key={event.title} event={event} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="positions">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
            {positions.length === 0 ? (
              <p className="text-xs text-neutral-600 py-4 text-center">No open positions</p>
            ) : (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div
                    key={pos.symbol}
                    className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{pos.symbol}</div>
                      <div className="text-xs text-neutral-500">{pos.quantity} contracts</div>
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
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30 p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">
              Order history loads from audit log
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
