import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSubmitOrder, type OrderStatus } from "@/hooks/use-submit-order";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const orderSchema = z.object({
  symbol: z.string().min(1, "Symbol required"),
  side: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().positive("Must be > 0"),
  orderType: z.enum(["market", "limit", "stop", "stop_limit", "trailing_stop"]),
  limitPrice: z.coerce.number().positive().optional(),
  stopPrice: z.coerce.number().positive().optional(),
  trailingPercent: z.coerce.number().min(0.1).max(50).optional(),
  stopLoss: z.coerce.number().positive().optional(),
  takeProfit: z.coerce.number().positive().optional(),
});

type OrderFormValues = z.infer<typeof orderSchema>;

type OrderEntryFormProps = {
  extensionId: string;
  defaultSymbol?: string;
  priceEstimate?: number;
  className?: string;
};

function PolicyPreCheck({ notionalUsd }: { notionalUsd: number }) {
  const { limits, dailySpendUsd, dailyTradeCount, positions, killSwitchActive } = useTradingStore();

  const checks = [
    {
      label: "Kill switch",
      pass: !killSwitchActive,
      detail: killSwitchActive ? "Trading halted" : "OK",
    },
    {
      label: "Single trade",
      pass: notionalUsd <= limits.maxSingleTradeUsd,
      detail: `$${notionalUsd.toFixed(0)} / $${limits.maxSingleTradeUsd}`,
    },
    {
      label: "Daily spend",
      pass: dailySpendUsd + notionalUsd <= limits.maxDailySpendUsd,
      detail: `$${(dailySpendUsd + notionalUsd).toFixed(0)} / $${limits.maxDailySpendUsd}`,
    },
    {
      label: "Trades today",
      pass: dailyTradeCount < limits.maxTradesPerDay,
      detail: `${dailyTradeCount + 1} / ${limits.maxTradesPerDay}`,
    },
    {
      label: "Open positions",
      pass: positions.length < limits.maxOpenPositions,
      detail: `${positions.length + 1} / ${limits.maxOpenPositions}`,
    },
  ];

  return (
    <div className="rounded-xl glass-panel p-3 space-y-1">
      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
        Policy Pre-Check
      </div>
      {checks.map((c) => (
        <div key={c.label} className="flex items-center justify-between text-xs">
          <span className="text-neutral-400">{c.label}</span>
          <span className={cn("font-mono", c.pass ? "text-green-400" : "text-red-400")}>
            {c.pass ? "PASS" : "FAIL"} — {c.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function OrderResultBanner({ state }: { state: OrderStatus }) {
  if (state.status === "idle" || state.status === "submitting") {
    return null;
  }

  return (
    <div
      className={cn("rounded-lg p-3 text-sm mt-3 transition-all duration-300", {
        "bg-green-900/30 border border-green-800 text-green-300": state.status === "success",
        "bg-red-900/30 border border-red-800 text-red-300":
          state.status === "denied" || state.status === "error",
        "bg-amber-900/30 border border-amber-800 text-amber-300": state.status === "pending",
      })}
    >
      {state.status === "success" && state.message}
      {state.status === "denied" && `Order denied: ${state.reason}`}
      {state.status === "pending" && `Awaiting ${state.approvalMode} approval`}
      {state.status === "error" && state.message}
    </div>
  );
}

export function OrderEntryForm({
  extensionId,
  defaultSymbol = "",
  priceEstimate = 0,
  className,
}: OrderEntryFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<OrderFormValues | null>(null);
  const killSwitchActive = useTradingStore((s) => s.killSwitchActive);
  const { state: orderState, submit, reset: resetOrder } = useSubmitOrder();

  // Auto-dismiss result after 5 seconds
  useEffect(() => {
    if (
      orderState.status === "success" ||
      orderState.status === "denied" ||
      orderState.status === "error"
    ) {
      const timer = setTimeout(() => resetOrder(), 5000);
      return () => clearTimeout(timer);
    }
  }, [orderState.status, resetOrder]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OrderFormValues>({
    defaultValues: {
      symbol: defaultSymbol,
      side: "buy",
      quantity: 1,
      orderType: "market",
    },
  });

  const watchSide = watch("side");
  const watchOrderType = watch("orderType");
  const watchQuantity = watch("quantity") || 0;
  const notionalUsd = priceEstimate > 0 ? watchQuantity * priceEstimate : watchQuantity;

  const needsLimitPrice = watchOrderType === "limit" || watchOrderType === "stop_limit";
  const needsStopPrice = watchOrderType === "stop" || watchOrderType === "stop_limit";
  const needsTrailing = watchOrderType === "trailing_stop";

  function onSubmit(data: OrderFormValues) {
    setPendingOrder(data);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!pendingOrder) {
      return;
    }
    setConfirmOpen(false);
    await submit({
      extensionId,
      symbol: pendingOrder.symbol,
      side: pendingOrder.side,
      quantity: pendingOrder.quantity,
      orderType: pendingOrder.orderType,
      limitPrice: pendingOrder.limitPrice,
      stopPrice: pendingOrder.stopPrice,
    });
    setPendingOrder(null);
  }

  return (
    <div className={cn("rounded-2xl glass-panel p-4", className)}>
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Place Order</h3>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {/* Symbol */}
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Symbol</label>
          <input
            {...register("symbol")}
            placeholder="e.g. AAPL"
            className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
          />
          {errors.symbol && <span className="text-xs text-red-400">{errors.symbol.message}</span>}
        </div>

        {/* Side toggle */}
        <div className="grid grid-cols-2 gap-2">
          <label
            className={cn(
              "flex items-center justify-center py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors border",
              watchSide === "buy"
                ? "bg-green-800 border-green-700 text-green-100"
                : "bg-[var(--glass-input-bg)] border-[var(--glass-border)] text-neutral-400 hover:text-neutral-200",
            )}
          >
            <input type="radio" value="buy" {...register("side")} className="sr-only" />
            BUY
          </label>
          <label
            className={cn(
              "flex items-center justify-center py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors border",
              watchSide === "sell"
                ? "bg-red-800 border-red-700 text-red-100"
                : "bg-[var(--glass-input-bg)] border-[var(--glass-border)] text-neutral-400 hover:text-neutral-200",
            )}
          >
            <input type="radio" value="sell" {...register("side")} className="sr-only" />
            SELL
          </label>
        </div>

        {/* Quantity */}
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Quantity</label>
          <input
            type="number"
            step="any"
            {...register("quantity")}
            className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 font-mono focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
          />
          {errors.quantity && (
            <span className="text-xs text-red-400">{errors.quantity.message}</span>
          )}
          {notionalUsd > 0 && (
            <div className="text-xs text-neutral-500 mt-0.5 font-mono">
              Est. ${notionalUsd.toFixed(2)}
            </div>
          )}
        </div>

        {/* Order type */}
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Order Type</label>
          <select
            {...register("orderType")}
            className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200 cursor-pointer"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
            <option value="stop_limit">Stop Limit</option>
            <option value="trailing_stop">Trailing Stop</option>
          </select>
        </div>

        {/* Conditional price fields */}
        {needsLimitPrice && (
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Limit Price</label>
            <input
              type="number"
              step="any"
              {...register("limitPrice")}
              className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 font-mono focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
            />
          </div>
        )}
        {needsStopPrice && (
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Stop Price</label>
            <input
              type="number"
              step="any"
              {...register("stopPrice")}
              className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 font-mono focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
            />
          </div>
        )}
        {needsTrailing && (
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Trailing %</label>
            <input
              type="number"
              step="0.1"
              {...register("trailingPercent")}
              placeholder="e.g. 2.5"
              className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 font-mono focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
            />
          </div>
        )}

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors"
        >
          {showAdvanced ? "Hide" : "Show"} advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-3 border-t border-[var(--glass-border)] pt-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Stop Loss</label>
              <input
                type="number"
                step="any"
                {...register("stopLoss")}
                placeholder="Optional"
                className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 font-mono focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Take Profit</label>
              <input
                type="number"
                step="any"
                {...register("takeProfit")}
                placeholder="Optional"
                className="w-full px-3 py-1.5 rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-sm text-neutral-200 font-mono focus:outline-none focus:border-orange-600 hover:border-[var(--glass-hover-strong)] transition-all duration-200"
              />
            </div>
          </div>
        )}

        {/* Policy pre-check */}
        <PolicyPreCheck notionalUsd={notionalUsd} />

        {/* Submit */}
        <button
          type="submit"
          disabled={killSwitchActive || orderState.status === "submitting"}
          className={cn(
            "w-full py-2 rounded-md text-sm font-semibold cursor-pointer transition-all duration-300",
            killSwitchActive || orderState.status === "submitting"
              ? "bg-neutral-700 text-neutral-500 cursor-not-allowed"
              : watchSide === "buy"
                ? "bg-green-700 hover:bg-green-600 text-white"
                : "bg-red-700 hover:bg-red-600 text-white",
          )}
        >
          {killSwitchActive
            ? "Trading Halted"
            : orderState.status === "submitting"
              ? "Submitting..."
              : `${watchSide === "buy" ? "Buy" : "Sell"} — Policy Gated`}
        </button>

        {/* Order result feedback */}
        <OrderResultBanner state={orderState} />
      </form>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingOrder && (
                <>
                  {pendingOrder.side.toUpperCase()} {pendingOrder.quantity}x {pendingOrder.symbol} (
                  {pendingOrder.orderType}) on {extensionId}
                  {notionalUsd > 0 && ` — est. $${notionalUsd.toFixed(2)}`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                pendingOrder?.side === "buy"
                  ? "bg-green-700 hover:bg-green-600 text-white"
                  : "bg-red-700 hover:bg-red-600 text-white",
              )}
            >
              Confirm {pendingOrder?.side.toUpperCase()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
