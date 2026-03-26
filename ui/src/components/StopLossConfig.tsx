import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useTradingStore, type Position } from "@/stores/trading-store";

type StopLossConfigProps = {
  position: Position;
  className?: string;
};

export function StopLossConfig({ position, className }: StopLossConfigProps) {
  const { t } = useTranslation("trading");
  const { t: tc } = useTranslation("common");
  const { updatePositionStopLoss, updatePositionTakeProfit } = useTradingStore();
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState(position.stopLoss?.toString() ?? "");
  const [tp, setTp] = useState(position.takeProfit?.toString() ?? "");

  function save() {
    const slVal = sl ? parseFloat(sl) : undefined;
    const tpVal = tp ? parseFloat(tp) : undefined;
    if (sl && (isNaN(slVal!) || slVal! <= 0)) {
      return;
    }
    if (tp && (isNaN(tpVal!) || tpVal! <= 0)) {
      return;
    }
    updatePositionStopLoss(position.symbol, slVal);
    updatePositionTakeProfit(position.symbol, tpVal);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer transition-all duration-200",
          className,
        )}
      >
        {position.stopLoss || position.takeProfit ? (
          <span className="font-mono">
            {position.stopLoss && (
              <span className="text-red-400">
                {t("sl")} ${position.stopLoss}
              </span>
            )}
            {position.stopLoss && position.takeProfit && " / "}
            {position.takeProfit && (
              <span className="text-green-400">
                {t("tp")} ${position.takeProfit}
              </span>
            )}
          </span>
        ) : (
          t("setSLTP")
        )}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <input
        type="number"
        step="any"
        value={sl}
        onChange={(e) => setSl(e.target.value)}
        placeholder={t("sl")}
        className="w-16 px-1.5 py-0.5 rounded bg-[var(--glass-input-bg)] border border-red-800/50 text-xs text-neutral-200 font-mono focus:outline-none focus:border-red-600 cursor-pointer transition-all duration-200"
      />
      <input
        type="number"
        step="any"
        value={tp}
        onChange={(e) => setTp(e.target.value)}
        placeholder={t("tp")}
        className="w-16 px-1.5 py-0.5 rounded bg-[var(--glass-input-bg)] border border-green-800/50 text-xs text-neutral-200 font-mono focus:outline-none focus:border-green-600 cursor-pointer transition-all duration-200"
      />
      <button
        onClick={save}
        className="text-xs text-green-400 hover:text-green-300 font-semibold cursor-pointer transition-all duration-200"
      >
        {tc("ok")}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer transition-all duration-200"
      >
        X
      </button>
    </div>
  );
}
