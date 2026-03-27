import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { OrderStatus } from "@/hooks/use-submit-order";
import { cn } from "@/lib/utils";
import type { Position } from "@/stores/trading-store";
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

type Props = {
  position: Position | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  status: OrderStatus;
};

export function ClosePositionDialog({ position, open, onOpenChange, onConfirm, status }: Props) {
  const { t } = useTranslation("trading");
  const { t: tc } = useTranslation("common");

  // Auto-close on success after 1.5s
  useEffect(() => {
    if (status.status === "success") {
      const timer = setTimeout(() => onOpenChange(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [status.status, onOpenChange]);

  if (!position) {
    return null;
  }

  const isSubmitting = status.status === "submitting";
  const isDone = status.status === "success";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("closePositionTitle", { defaultValue: "Close Position?" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("closePositionDesc", {
              qty: position.quantity,
              symbol: position.symbol,
              platform: position.extensionId,
              defaultValue: `Close ${position.quantity} ${position.symbol} on ${position.extensionId} at market price?`,
            })}
          </AlertDialogDescription>

          {/* P&L context */}
          <div
            className={cn(
              "mt-2 rounded-md border p-3 text-xs",
              position.unrealizedPnl >= 0
                ? "bg-green-950/50 border-green-900 text-green-300"
                : "bg-red-950/50 border-red-900 text-red-300",
            )}
          >
            <span className="font-semibold">Unrealized P&L: </span>
            {position.unrealizedPnl >= 0 ? "+" : ""}${position.unrealizedPnl.toFixed(2)}
            <span className="text-neutral-500 ml-2">
              ({position.percentOfPortfolio.toFixed(1)}% of portfolio)
            </span>
          </div>

          {/* Status feedback */}
          {status.status === "denied" && (
            <div className="mt-2 rounded-md bg-red-950/50 border border-red-900 p-3 text-xs text-red-300">
              {t("closePositionDenied", {
                reason: status.reason,
                defaultValue: `Close denied: ${status.reason}`,
              })}
            </div>
          )}
          {status.status === "error" && (
            <div className="mt-2 rounded-md bg-red-950/50 border border-red-900 p-3 text-xs text-red-300">
              {t("closePositionError", {
                message: status.message,
                defaultValue: `Close failed: ${status.message}`,
              })}
            </div>
          )}
          {status.status === "success" && (
            <div className="mt-2 rounded-md bg-green-950/50 border border-green-900 p-3 text-xs text-green-300">
              {t("positionClosed", { defaultValue: "Position closed" })}
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSubmitting || isDone}
            className="bg-red-700 hover:bg-red-600 text-white"
          >
            {isSubmitting
              ? t("closingPosition", { defaultValue: "Closing..." })
              : isDone
                ? t("positionClosed", { defaultValue: "Position closed" })
                : t("closePosition", { defaultValue: "Close Position" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
