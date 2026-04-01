import { X, Copy, Check, Pin } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeExecutionResult = {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: "success" | "error" | "skipped" | "retrying";
  startedAt: number;
  completedAt: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
  pinned?: boolean;
};

type NodeDataInspectorProps = {
  result: NodeExecutionResult;
  onClose?: () => void;
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const statusStyles: Record<NodeExecutionResult["status"], string> = {
  success: "bg-green-900 text-green-300",
  error: "bg-red-900 text-red-300",
  skipped: "bg-neutral-800 text-neutral-400",
  retrying: "bg-amber-900 text-amber-300",
};

function StatusBadge({ status }: { status: NodeExecutionResult["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        statusStyles[status],
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
        active
          ? "text-neutral-100 border-b-2 border-orange-500"
          : "text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyJsonButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write can fail in insecure contexts — silently ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy JSON
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recursive JSON tree view
// ---------------------------------------------------------------------------

const MAX_DEPTH = 10;
const STRING_TRUNCATE = 200;

function JsonTreeView({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (depth > MAX_DEPTH) {
    return <span className="text-neutral-500 italic text-xs">…max depth</span>;
  }

  // null / undefined
  if (data === null) {
    return <span className="text-neutral-500 italic">null</span>;
  }
  if (data === undefined) {
    return <span className="text-neutral-500 italic">undefined</span>;
  }

  // string
  if (typeof data === "string") {
    const display = data.length > STRING_TRUNCATE ? `${data.slice(0, STRING_TRUNCATE)}…` : data;
    return <span className="text-green-400">&quot;{display}&quot;</span>;
  }

  // number
  if (typeof data === "number") {
    return <span className="text-blue-400">{String(data)}</span>;
  }

  // boolean
  if (typeof data === "boolean") {
    return <span className="text-purple-400">{String(data)}</span>;
  }

  // array
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-neutral-500">[ ]</span>;
    }
    return (
      <details className="group">
        <summary className="cursor-pointer select-none text-neutral-400 hover:text-neutral-200 transition-colors">
          <span className="text-neutral-500">[</span>
          <span className="text-xs text-neutral-500 ml-1">{data.length} items</span>
          <span className="text-neutral-500">]</span>
        </summary>
        <div className="ml-4 border-l border-neutral-800 pl-3 mt-0.5 space-y-0.5">
          {data.map((item, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-xs">
              <span className="text-neutral-600 shrink-0 font-mono">{idx}:</span>
              <JsonTreeView data={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      </details>
    );
  }

  // object
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-neutral-500">{"{ }"}</span>;
    }
    return (
      <details className="group" open={depth < 2}>
        <summary className="cursor-pointer select-none text-neutral-400 hover:text-neutral-200 transition-colors">
          <span className="text-neutral-500">{"{"}</span>
          <span className="text-xs text-neutral-500 ml-1">{entries.length} keys</span>
          <span className="text-neutral-500">{"}"}</span>
        </summary>
        <div className="ml-4 border-l border-neutral-800 pl-3 mt-0.5 space-y-0.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-1.5 text-xs">
              <span className="text-orange-400/80 shrink-0 font-mono">{key}:</span>
              <JsonTreeView data={value} depth={depth + 1} />
            </div>
          ))}
        </div>
      </details>
    );
  }

  // fallback
  return <span className="text-neutral-500">{String(data as string)}</span>;
}

// ---------------------------------------------------------------------------
// Input / Output views
// ---------------------------------------------------------------------------

function InputView({ data }: { data?: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-neutral-600 py-4 text-center">No input data captured</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={data} />
      </div>
      <div className="text-xs font-mono leading-relaxed">
        <JsonTreeView data={data} />
      </div>
    </div>
  );
}

function OutputView({
  data,
  error,
  status,
}: {
  data?: Record<string, unknown>;
  error?: string;
  status: NodeExecutionResult["status"];
}) {
  const hasOutput = data && Object.keys(data).length > 0;

  return (
    <div className="space-y-2">
      {/* Error alert */}
      {status === "error" && error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          <span className="font-semibold">Error: </span>
          {error}
        </div>
      )}

      {hasOutput ? (
        <>
          <div className="flex justify-end">
            <CopyJsonButton data={data} />
          </div>
          <div className="text-xs font-mono leading-relaxed">
            <JsonTreeView data={data} />
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-600 py-4 text-center">No output data</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type { NodeExecutionResult, NodeDataInspectorProps };

export function NodeDataInspector({ result, onClose }: NodeDataInspectorProps) {
  const [tab, setTab] = useState<"input" | "output">("output");
  const duration = result.completedAt - result.startedAt;

  return (
    <div className="flex flex-col h-full border-l border-neutral-800 bg-[var(--glass-bg,rgba(14,14,16,0.92))]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm text-neutral-100 truncate">{result.nodeLabel}</span>
          <StatusBadge status={result.status} />
          <span className="text-[11px] text-neutral-500 tabular-nums shrink-0">{duration}ms</span>
          {result.retryCount != null && result.retryCount > 0 && (
            <span className="text-[10px] text-amber-400 shrink-0">retry #{result.retryCount}</span>
          )}
          {result.pinned && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-blue-400 shrink-0">
              <Pin className="h-3 w-3" />
              Pinned
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer ml-2 shrink-0"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        <TabButton active={tab === "input"} onClick={() => setTab("input")}>
          Input
        </TabButton>
        <TabButton active={tab === "output"} onClick={() => setTab("output")}>
          Output
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === "input" ? (
          <InputView data={result.input} />
        ) : (
          <OutputView data={result.output} error={result.error} status={result.status} />
        )}
      </div>
    </div>
  );
}
