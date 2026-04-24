import { Check, CircleX, FileClock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { cn } from "@/lib/utils";

type AuditEntry = {
  timestamp: string;
  extensionId: string;
  action: string;
  actor: string;
  orderSnapshot?: string | null;
  policySnapshot?: string | null;
  error?: string | null;
  prevHash: string;
  hmac: string;
};

type ListResponse = {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
};

type VerifyResponse = {
  valid: number;
  brokenAt?: number;
  hmacFailedAt?: number;
};

const PAGE_SIZE = 50;

function ActionBadge({ action }: { action: string }) {
  const destructive = /denied|failed|rejected/i.test(action);
  const success = /approved|filled|submitted/i.test(action);
  const variant = destructive ? "destructive" : success ? "success" : "outline";
  return <Badge variant={variant}>{action}</Badge>;
}

function formatTimestamp(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return raw;
  }
  return d.toLocaleString();
}

function shortHash(h: string): string {
  if (!h) {
    return "—";
  }
  return h.length > 16 ? `${h.slice(0, 16)}…` : h;
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [extensionFilter, setExtensionFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { limit: PAGE_SIZE, offset };
      if (extensionFilter.trim()) {
        params.extensionId = extensionFilter.trim();
      }
      if (actionFilter.trim()) {
        params.action = actionFilter.trim();
      }
      const result = await gatewayRpc<ListResponse>("audit.list", params);
      if (!result.ok) {
        setError(result.error || "Failed to load audit log");
        setEntries([]);
        setTotal(0);
        return;
      }
      setEntries(result.payload.entries ?? []);
      setTotal(result.payload.total ?? 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [offset, extensionFilter, actionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runVerify = useCallback(async () => {
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const result = await gatewayRpc<VerifyResponse>("audit.verify", {});
      if (!result.ok) {
        setVerifyError(result.error || "Verification failed");
        return;
      }
      setVerifyResult(result.payload);
    } catch (err) {
      setVerifyError(String(err));
    } finally {
      setVerifying(false);
    }
  }, []);

  const extensionSuggestions = useMemo(
    () => [...new Set(entries.map((e) => e.extensionId).filter(Boolean))].toSorted(),
    [entries],
  );
  const actionSuggestions = useMemo(
    () => [...new Set(entries.map((e) => e.action).filter(Boolean))].toSorted(),
    [entries],
  );

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const chainBroken = verifyResult && typeof verifyResult.brokenAt === "number";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-orange-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-neutral-100">Audit Log</h1>
          <p className="text-xs text-neutral-500">
            HMAC-chained trading audit entries. Every decision is signed and linked to the previous
            entry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runVerify}
            disabled={verifying}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              "bg-[var(--glass-subtle-hover)] text-neutral-200 hover:bg-[var(--glass-border)]",
              "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
            )}
          >
            {verifying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Verify Chain
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              "bg-[var(--glass-subtle-hover)] text-neutral-200 hover:bg-[var(--glass-border)]",
              "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
            )}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {verifyResult && !chainBroken && (
        <div
          role="note"
          className="rounded-xl border border-green-800/60 bg-green-950/30 px-4 py-3 text-sm text-green-300 flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-green-400" />
          Chain intact — {verifyResult.valid} {verifyResult.valid === 1 ? "entry" : "entries"}{" "}
          verified.
        </div>
      )}
      {verifyResult && chainBroken && (
        <div
          role="alert"
          className="rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300 flex items-center gap-2"
        >
          <CircleX className="w-4 h-4 text-red-400" />
          Chain broken at entry #{verifyResult.brokenAt}
          {typeof verifyResult.hmacFailedAt === "number"
            ? " (HMAC mismatch)"
            : " (prev-hash mismatch)"}
          . {verifyResult.valid} prior {verifyResult.valid === 1 ? "entry" : "entries"} verified.
        </div>
      )}
      {verifyError && (
        <div
          role="alert"
          className="rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          Verify failed: {verifyError}
        </div>
      )}

      <div className="rounded-2xl glass-panel p-3 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1 block">
            Extension
          </label>
          <Input
            list="audit-extension-suggestions"
            placeholder="e.g. alpaca"
            value={extensionFilter}
            onChange={(e) => {
              setOffset(0);
              setExtensionFilter(e.target.value);
            }}
          />
          <datalist id="audit-extension-suggestions">
            {extensionSuggestions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1 block">
            Action
          </label>
          <Input
            list="audit-action-suggestions"
            placeholder="e.g. order_submitted"
            value={actionFilter}
            onChange={(e) => {
              setOffset(0);
              setActionFilter(e.target.value);
            }}
          />
          <datalist id="audit-action-suggestions">
            {actionSuggestions.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="rounded-2xl glass-panel overflow-hidden">
        {error && (
          <div className="p-4 text-sm text-red-400 border-b border-[var(--glass-divider)]">
            {error}
          </div>
        )}
        {!error && entries.length === 0 && !loading && (
          <div className="p-8 text-center text-sm text-neutral-500 flex flex-col items-center gap-2">
            <FileClock className="w-8 h-8 text-neutral-600" />
            No audit entries match the current filters.
          </div>
        )}
        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-neutral-500 border-b border-[var(--glass-divider)]">
                  <th className="py-2 px-3 text-left font-medium">Time</th>
                  <th className="py-2 px-3 text-left font-medium">Extension</th>
                  <th className="py-2 px-3 text-left font-medium">Action</th>
                  <th className="py-2 px-3 text-left font-medium">Actor</th>
                  <th className="py-2 px-3 text-left font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const id = `${entry.timestamp}-${entry.hmac}`;
                  const expanded = expandedId === id;
                  return (
                    <Fragment key={id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : id)}
                        className={cn(
                          "border-b border-[var(--glass-divider)] hover:bg-[var(--glass-divider)] cursor-pointer transition-colors",
                          expanded && "bg-[var(--glass-divider)]",
                        )}
                      >
                        <td className="py-2 px-3 font-mono text-[11px] text-neutral-400">
                          {formatTimestamp(entry.timestamp)}
                        </td>
                        <td className="py-2 px-3 text-neutral-200">{entry.extensionId}</td>
                        <td className="py-2 px-3">
                          <ActionBadge action={entry.action} />
                        </td>
                        <td className="py-2 px-3 text-neutral-300">{entry.actor}</td>
                        <td className="py-2 px-3 text-neutral-400 truncate max-w-[320px]">
                          {entry.error
                            ? entry.error
                            : entry.orderSnapshot
                              ? entry.orderSnapshot.slice(0, 80) +
                                (entry.orderSnapshot.length > 80 ? "…" : "")
                              : "—"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[var(--glass-divider)]">
                          <td
                            colSpan={5}
                            className="py-3 px-3 border-b border-[var(--glass-divider)]"
                          >
                            <div className="space-y-2 text-xs font-mono">
                              {entry.orderSnapshot && (
                                <div>
                                  <div className="text-neutral-500 mb-1">Order snapshot</div>
                                  <pre className="bg-neutral-900/60 rounded-lg p-2 overflow-auto max-h-60 whitespace-pre-wrap break-words">
                                    {entry.orderSnapshot}
                                  </pre>
                                </div>
                              )}
                              {entry.policySnapshot && (
                                <div>
                                  <div className="text-neutral-500 mb-1">Policy snapshot</div>
                                  <pre className="bg-neutral-900/60 rounded-lg p-2 overflow-auto max-h-60 whitespace-pre-wrap break-words">
                                    {entry.policySnapshot}
                                  </pre>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-4 pt-1 text-neutral-500">
                                <span>prev: {shortHash(entry.prevHash)}</span>
                                <span>hmac: {shortHash(entry.hmac)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div>
            Page {page} of {totalPages} · {total} total
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="px-3 py-1.5 rounded-lg bg-[var(--glass-subtle-hover)] hover:bg-[var(--glass-border)] text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Prev
            </button>
            <button
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-3 py-1.5 rounded-lg bg-[var(--glass-subtle-hover)] hover:bg-[var(--glass-border)] text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
