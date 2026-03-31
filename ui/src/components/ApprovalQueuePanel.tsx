import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { cn } from "@/lib/utils";
import { useTradingStore, type PendingApproval } from "@/stores/trading-store";

type UndoEntry = {
  id: string;
  action: "approved" | "denied";
  approval: PendingApproval;
  expiresAt: number;
};

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: PendingApproval;
  onApprove: (a: PendingApproval) => void;
  onDeny: (a: PendingApproval) => void;
}) {
  const { t: tc } = useTranslation("common");
  const { currency } = useFormatters();
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, approval.timeoutMs - (Date.now() - approval.createdAt)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, approval.timeoutMs - (Date.now() - approval.createdAt));
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [approval]);

  const remainingSec = Math.ceil(remainingMs / 1000);
  const totalSec = Math.ceil(approval.timeoutMs / 1000);
  const timeoutFraction = totalSec > 0 ? remainingSec / totalSec : 0;

  return (
    <div className="rounded-xl glass-panel-interactive p-3 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-neutral-200">
          {approval.side.toUpperCase()} {approval.quantity}x {approval.symbol}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-400">
          {approval.extensionId}
        </span>
      </div>
      <div className="text-xs text-neutral-400 space-y-0.5 mb-3">
        <div>
          {tc("amount")}: {currency(approval.notionalUsd)}
        </div>
        <div>
          {tc("result")}: {approval.riskPercent.toFixed(1)}%
        </div>
        <div className="text-neutral-500">
          {tc("type")}: <span className="capitalize">{approval.mode}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => onApprove(approval)}
          className="flex-1 px-3 py-1.5 rounded text-xs font-semibold bg-green-700 hover:bg-green-600 text-green-100 cursor-pointer transition-all duration-300 hover:shadow-md hover:shadow-green-900/30"
        >
          {tc("approve")}
        </button>
        <button
          onClick={() => onDeny(approval)}
          className="flex-1 px-3 py-1.5 rounded text-xs font-semibold bg-red-800 hover:bg-red-700 text-red-100 cursor-pointer transition-all duration-300 hover:shadow-md hover:shadow-red-900/30"
        >
          {tc("deny")}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <div className="flex-1 h-1 bg-[var(--glass-subtle-hover)] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              timeoutFraction > 0.3 ? "bg-blue-500" : "bg-red-500",
            )}
            style={{ width: `${timeoutFraction * 100}%` }}
          />
        </div>
        <span className="font-mono">{remainingSec}s</span>
      </div>
    </div>
  );
}

export function ApprovalQueuePanel() {
  const { t } = useTranslation("trading");
  const pendingApprovals = useTradingStore((s) => s.pendingApprovals);
  const removePendingApproval = useTradingStore((s) => s.removePendingApproval);
  const addPendingApproval = useTradingStore((s) => s.addPendingApproval);
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);

  // Clean up expired undo entries
  useEffect(() => {
    if (undoEntries.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      setUndoEntries((prev) => prev.filter((u) => u.expiresAt > Date.now()));
    }, 500);
    return () => clearInterval(interval);
  }, [undoEntries.length]);

  const handleAction = useCallback(
    (approval: PendingApproval, action: "approved" | "denied") => {
      removePendingApproval(approval.id);
      setUndoEntries((prev) => [
        ...prev,
        { id: approval.id, action, approval, expiresAt: Date.now() + 5000 },
      ]);
    },
    [removePendingApproval],
  );

  const handleUndo = useCallback(
    (entry: UndoEntry) => {
      addPendingApproval(entry.approval);
      setUndoEntries((prev) => prev.filter((u) => u.id !== entry.id));
    },
    [addPendingApproval],
  );

  const handleBulkApprove = useCallback(() => {
    for (const a of pendingApprovals) {
      handleAction(a, "approved");
    }
  }, [pendingApprovals, handleAction]);

  return (
    <div className="rounded-2xl glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">
          {t("pendingApprovals")}
          {pendingApprovals.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-amber-900 text-amber-300">
              {pendingApprovals.length}
            </span>
          )}
        </h3>
        {pendingApprovals.length > 1 && (
          <button
            onClick={handleBulkApprove}
            className="text-xs text-green-400 hover:text-green-300 font-semibold transition-colors cursor-pointer"
          >
            {t("approveAll")}
          </button>
        )}
      </div>

      {/* Undo toasts */}
      {undoEntries.length > 0 && (
        <div className="space-y-1 mb-3">
          {undoEntries.map((entry) => {
            const remainSec = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-1.5 text-xs",
                  entry.action === "approved"
                    ? "bg-green-950/40 border border-green-900/50 text-green-300"
                    : "bg-red-950/40 border border-red-900/50 text-red-300",
                )}
              >
                <span>
                  {entry.action === "approved" ? t("approved") : t("denied")}{" "}
                  {entry.approval.side.toUpperCase()} {entry.approval.symbol}
                </span>
                <button
                  onClick={() => handleUndo(entry)}
                  className="font-semibold hover:underline ml-2 cursor-pointer"
                >
                  {t("undoSeconds", { seconds: remainSec })}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pendingApprovals.length === 0 && undoEntries.length === 0 ? (
        <p className="text-xs text-neutral-600 py-4 text-center">{t("noPendingApprovals")}</p>
      ) : (
        <div className="space-y-2">
          {pendingApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={(a) => handleAction(a, "approved")}
              onDeny={(a) => handleAction(a, "denied")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
