import { cn, assetUrl } from "@/lib/utils";

const ICON_MAP: Record<string, string> = {
  alpaca: "alpaca",
  polymarket: "polymarket",
  kalshi: "kalshi",
  manifold: "manifold",
  coinbase: "coinbase",
  ibkr: "interactive-brokers",
  binance: "binance",
  kraken: "kraken",
  dydx: "dydx",
};

export function PlatformIcon({
  platformId,
  className,
}: {
  platformId: string;
  className?: string;
}) {
  const file = ICON_MAP[platformId] ?? platformId;
  return (
    <img
      src={assetUrl(`icons/trading-platforms/${file}.svg`)}
      alt=""
      className={cn("w-4 h-4", className)}
    />
  );
}
