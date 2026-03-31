import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectDialog } from "@/components/ConnectDialog";
import { OrderEntrySheet } from "@/components/OrderEntrySheet";
import { TradingViewChart } from "@/components/TradingViewChart";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { cn, assetUrl } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

function AccountCard() {
  const { t } = useTranslation("platforms");
  const { currentPortfolioValueUsd } = useTradingStore();
  return (
    <div className="rounded-2xl glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">{t("account")}</h3>
        <Badge variant="secondary">Paper</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-neutral-500">{t("equity")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">
            ${currentPortfolioValueUsd.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">{t("buyingPower")}</div>
          <div className="text-lg font-bold font-mono text-neutral-100">
            ${(currentPortfolioValueUsd * 4).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">{t("dayTrades")}</div>
          <div className="text-sm font-mono text-neutral-300">2 / 3</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">{t("pdtStatus")}</div>
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
    <tr className="text-xs border-b border-[var(--glass-divider)] hover:bg-[var(--glass-divider)] transition-colors duration-200">
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
  const { t } = useTranslation("platforms");
  const { t: tc } = useTranslation("common");
  const positions = useTradingStore((s) => s.positions).filter((p) => p.extensionId === "alpaca");
  const platform = useTradingStore((s) => s.platforms.alpaca);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src={assetUrl("icons/trading-platforms/alpaca.svg")} alt="" className="w-6 h-6" />
        <h1 className="text-xl font-bold text-neutral-100">Alpaca</h1>
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

      <div className="space-y-4">
        <AccountCard />

        <Tabs defaultValue="positions">
          <TabsList>
            <TabsTrigger value="positions">{t("positions")}</TabsTrigger>
            <TabsTrigger value="orders">{t("orderHistory")}</TabsTrigger>
          </TabsList>
          <TabsContent value="positions">
            <div className="rounded-2xl glass-panel p-4">
              {positions.length === 0 ? (
                <p className="text-xs text-neutral-600 py-4 text-center">{tc("noPositions")}</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-neutral-500 border-b border-[var(--glass-subtle-hover)]">
                      <th className="py-1.5 pr-2 text-left font-medium">{tc("symbol")}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{tc("qty")}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{tc("avgEntry")}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{tc("current")}</th>
                      <th className="py-1.5 text-right font-medium">{tc("pnl")}</th>
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
            <div className="rounded-2xl glass-panel p-4">
              <p className="text-xs text-neutral-600 py-4 text-center">
                {tc("orderHistoryAuditLog")}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <OrderEntrySheet extensionId="alpaca" defaultSymbol="AAPL" priceEstimate={219} />
    </div>
  );
}
