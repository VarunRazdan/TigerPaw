import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectDialog } from "@/components/ConnectDialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const DEMO_MARKETS = [
  {
    question: "Will GPT-5 be released by June 2026?",
    probability: 45,
    volume: "M$12.4K",
    creator: "Metaculus",
  },
  { question: "Will Anthropic IPO in 2026?", probability: 18, volume: "M$5.6K", creator: "Scott" },
  {
    question: "Will a new country join the EU by 2028?",
    probability: 32,
    volume: "M$3.1K",
    creator: "Europa",
  },
  {
    question: "Will nuclear fusion achieve net energy by 2030?",
    probability: 28,
    volume: "M$8.9K",
    creator: "Physics",
  },
];

function MarketCard({ market }: { market: (typeof DEMO_MARKETS)[0] }) {
  const { t } = useTranslation("platforms");
  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <div className="text-sm font-medium text-neutral-200 mb-2">{market.question}</div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--glass-subtle-hover)]">
          <div
            className="bg-blue-500 h-full rounded-full"
            style={{ width: `${market.probability}%` }}
          />
        </div>
        <span className="text-sm font-bold font-mono text-blue-400">{market.probability}%</span>
      </div>
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-neutral-500">by {market.creator}</span>
        <span className="text-neutral-500">{market.volume} volume</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="px-3 py-1.5 rounded text-xs font-semibold bg-green-800 hover:bg-green-700 hover:-translate-y-0.5 hover:scale-105 text-green-100 cursor-pointer transition-all duration-300 hover:shadow-md">
          {t("betYes")}
        </button>
        <button className="px-3 py-1.5 rounded text-xs font-semibold bg-red-800 hover:bg-red-700 hover:-translate-y-0.5 hover:scale-105 text-red-100 cursor-pointer transition-all duration-300 hover:shadow-md">
          {t("betNo")}
        </button>
      </div>
    </div>
  );
}

export function ManifoldPage() {
  const { t } = useTranslation("platforms");
  const { t: tc } = useTranslation("common");
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "manifold");
  const platform = useTradingStore((s) => s.platforms.manifold);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src="/icons/trading-platforms/manifold.svg" alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Manifold</h1>
        <Badge
          className={cn(
            platform?.connected
              ? "bg-green-900 text-green-300 border-green-800"
              : "bg-[var(--glass-subtle-hover)] text-neutral-400 border-[var(--glass-subtle-hover)] cursor-pointer hover:bg-[var(--glass-border)] hover:text-orange-400",
          )}
          onClick={() => !platform?.connected && setConnectOpen(true)}
        >
          {platform?.connected ? tc("connected") : tc("notConnected")}
        </Badge>
        <Badge className="bg-blue-900 text-blue-300 border-blue-800">{t("playMoney")}</Badge>
      </div>
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        info={TRADING_CONNECT_INFO.manifold}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl glass-panel p-3">
          <div className="text-xs text-neutral-500">{t("manaBalance")}</div>
          <div className="text-lg font-bold font-mono text-blue-400">M$2,450</div>
        </div>
        <div className="rounded-2xl glass-panel p-3">
          <div className="text-xs text-neutral-500">{t("activeBets")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">{positions.length}</div>
        </div>
        <div className="rounded-2xl glass-panel p-3">
          <div className="text-xs text-neutral-500">{t("lifetimePnl")}</div>
          <div className="text-lg font-bold font-mono text-green-400">+M$340</div>
        </div>
      </div>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">{t("browseMarkets")}</TabsTrigger>
          <TabsTrigger value="bets">{t("myBets")}</TabsTrigger>
          <TabsTrigger value="history">{t("history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEMO_MARKETS.map((market) => (
              <MarketCard key={market.question} market={market} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bets">
          <div className="rounded-2xl glass-panel p-4">
            {positions.length === 0 ? (
              <p className="text-xs text-neutral-600 py-4 text-center">{t("noActiveBets")}</p>
            ) : (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div
                    key={pos.symbol}
                    className="flex items-center justify-between py-2 border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-divider)] transition-colors duration-200 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-200">{pos.symbol}</div>
                      <div className="text-xs text-neutral-500">{pos.quantity} shares</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-blue-400">
                        M${pos.valueUsd.toFixed(0)}
                      </div>
                      <div
                        className={cn(
                          "text-xs font-mono",
                          pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400",
                        )}
                      >
                        {pos.unrealizedPnl >= 0 ? "+" : ""}M${pos.unrealizedPnl.toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-2xl glass-panel p-4">
            <p className="text-xs text-neutral-600 py-4 text-center">
              {tc("orderHistoryAuditLog")}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
