import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useTradingStore, type TradeHistoryEntry } from "@/stores/trading-store";

const columnHelper = createColumnHelper<TradeHistoryEntry>();

const APPROVAL_LABELS: Record<string, string> = {
  auto_approved: "AUTO",
  manually_approved: "MANUAL",
  denied: "DENIED",
  cancelled: "CANCELLED",
};

function buildColumns(t: (key: string) => string, tc: (key: string) => string) {
  return [
    columnHelper.accessor("timestamp", {
      header: tc("time"),
      cell: (info) =>
        new Date(info.getValue()).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      sortingFn: "datetime",
    }),
    columnHelper.accessor("approvalType", {
      header: "Type",
      cell: (info) => {
        const val = info.getValue();
        const label = APPROVAL_LABELS[val] ?? val;
        const colorCls =
          val === "denied"
            ? "bg-red-900/50 text-red-400"
            : val === "auto_approved"
              ? "bg-green-900/50 text-green-400"
              : "bg-blue-900/50 text-blue-400";
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", colorCls)}>
            {label}
          </span>
        );
      },
    }),
    columnHelper.accessor("extensionId", {
      header: tc("source"),
    }),
    columnHelper.display({
      id: "instrument",
      header: tc("instrument"),
      cell: (info) => (
        <span className="text-neutral-300">
          {info.row.original.side.toUpperCase()} {info.row.original.symbol}
        </span>
      ),
    }),
    columnHelper.accessor("amount", {
      header: tc("amount"),
      cell: (info) => <span className="font-mono">${info.getValue().toFixed(2)}</span>,
      meta: { align: "right" },
    }),
    columnHelper.display({
      id: "slippage",
      header: t("slippage"),
      cell: (info) => {
        const { expectedPrice, executedPrice, side } = info.row.original;
        if (expectedPrice == null || executedPrice == null) {
          return <span className="text-neutral-600">—</span>;
        }
        const slipBps =
          expectedPrice > 0 ? ((executedPrice - expectedPrice) / expectedPrice) * 10000 : 0;
        const isBuy = side.toLowerCase() === "buy";
        const adverseSlip = isBuy ? slipBps : -slipBps;
        return (
          <span
            className={cn(
              "font-mono text-[10px]",
              adverseSlip > 1
                ? "text-red-400"
                : adverseSlip < -1
                  ? "text-green-400"
                  : "text-neutral-400",
            )}
          >
            {adverseSlip > 0 ? "+" : ""}
            {adverseSlip.toFixed(1)}bp
          </span>
        );
      },
    }),
    columnHelper.accessor("result", {
      header: tc("result"),
      cell: (info) => {
        const val = info.getValue();
        const colorCls =
          val === "filled"
            ? "text-green-400"
            : val === "cancelled"
              ? "text-amber-400"
              : "text-red-400";
        return (
          <span className={cn("font-mono", colorCls)}>
            {val === "filled" ? "FILL" : val.toUpperCase()}
          </span>
        );
      },
    }),
  ];
}

function exportCsv(data: TradeHistoryEntry[]) {
  const headers = [
    "Time",
    "Approval",
    "Source",
    "Side",
    "Symbol",
    "Amount",
    "Result",
    "Reason",
    "Expected",
    "Executed",
  ];
  const rows = data.map((t) => [
    t.timestamp,
    t.approvalType,
    t.extensionId,
    t.side,
    t.symbol,
    t.amount.toFixed(2),
    t.result,
    t.reason ?? "",
    t.expectedPrice?.toFixed(2) ?? "",
    t.executedPrice?.toFixed(2) ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TradeHistoryTable() {
  const { t } = useTranslation("trading");
  const { t: tc } = useTranslation("common");
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => buildColumns(t, tc), [t, tc]);

  const table = useReactTable({
    data: tradeHistory,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  return (
    <div className="rounded-2xl glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">{t("tradeHistory")}</h3>
        <div className="flex items-center gap-2">
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Filter..."
            className="px-2 py-1 text-xs rounded-md bg-[var(--glass-input-bg)] border border-[var(--glass-border)] text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:border-orange-600 w-32"
          />
          <button
            onClick={() => exportCsv(tradeHistory)}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors px-2 py-1 rounded border border-[var(--glass-border)] hover:border-[var(--glass-active-border)] cursor-pointer"
          >
            {t("exportCsv")}
          </button>
        </div>
      </div>

      {tradeHistory.length === 0 ? (
        <p className="text-xs text-neutral-600 py-4 text-center">{t("noTrades")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr
                    key={hg.id}
                    className="text-xs text-neutral-500 border-b border-[var(--glass-subtle-hover)]"
                  >
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "py-1.5 pr-2 text-left font-medium select-none",
                          header.column.getCanSort() && "cursor-pointer hover:text-neutral-300",
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: " ↑",
                            desc: " ↓",
                          }[header.column.getIsSorted() as string] ?? null}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const result = row.original.result;
                  const rowBg =
                    result === "filled"
                      ? "hover:bg-green-950/20"
                      : result === "denied" || result === "rejected"
                        ? "hover:bg-red-950/20"
                        : "hover:bg-[var(--glass-divider)]";
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "text-xs border-b border-[var(--glass-divider)] transition-colors duration-200",
                        rowBg,
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="py-2 pr-2 text-neutral-400">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--glass-border)]">
              <span className="text-xs text-neutral-500">
                {tc("page")} {pageIndex + 1} {tc("of")} {pageCount}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-xs rounded border border-[var(--glass-border)] text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {tc("prev")}
                </button>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-xs rounded border border-[var(--glass-border)] text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {tc("next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
