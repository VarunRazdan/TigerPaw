import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Save,
  Play,
  ArrowLeft,
  Zap,
  GitBranch,
  Send,
  Shuffle,
  Plus,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Copy,
  Trash2,
  X,
  RotateCcw,
  Settings2,
  History,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useWorkflowStore,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowExecution,
  type RetryConfig,
  type WorkflowVersionMeta,
  type StoredCredentialMeta,
} from "@/stores/workflow-store";

// ---------------------------------------------------------------------------
// Palette definitions
// ---------------------------------------------------------------------------

type PaletteItem = {
  subtype: string;
  label: string;
  nodeType: WorkflowNodeType;
};

type PaletteGroup = {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: PaletteItem[];
};

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    title: "Triggers",
    icon: <Zap className="w-3.5 h-3.5" />,
    color: "text-amber-400",
    items: [
      { subtype: "message.received", label: "Message Received", nodeType: "trigger" },
      { subtype: "cron", label: "Cron Schedule", nodeType: "trigger" },
      { subtype: "trading.event", label: "Trading Event", nodeType: "trigger" },
      { subtype: "webhook", label: "Webhook", nodeType: "trigger" },
      { subtype: "manual", label: "Manual", nodeType: "trigger" },
    ],
  },
  {
    title: "Conditions",
    icon: <GitBranch className="w-3.5 h-3.5" />,
    color: "text-blue-400",
    items: [
      { subtype: "contains_keyword", label: "Contains Keyword", nodeType: "condition" },
      { subtype: "sender_matches", label: "Sender Matches", nodeType: "condition" },
      { subtype: "time_of_day", label: "Time of Day", nodeType: "condition" },
      { subtype: "channel_is", label: "Channel Is", nodeType: "condition" },
      { subtype: "expression", label: "Expression", nodeType: "condition" },
    ],
  },
  {
    title: "Actions",
    icon: <Send className="w-3.5 h-3.5" />,
    color: "text-green-400",
    items: [
      { subtype: "send_message", label: "Send Message", nodeType: "action" },
      { subtype: "call_webhook", label: "Call Webhook", nodeType: "action" },
      { subtype: "run_llm_task", label: "Run LLM Task", nodeType: "action" },
      { subtype: "killswitch", label: "Kill Switch", nodeType: "action" },
      { subtype: "trade", label: "Submit Trade", nodeType: "action" },
      { subtype: "run_workflow", label: "Run Sub-Workflow", nodeType: "action" },
    ],
  },
  {
    title: "Transforms",
    icon: <Shuffle className="w-3.5 h-3.5" />,
    color: "text-purple-400",
    items: [
      { subtype: "extract_data", label: "Extract Data", nodeType: "transform" },
      { subtype: "format_text", label: "Format Text", nodeType: "transform" },
      { subtype: "parse_json", label: "Parse JSON", nodeType: "transform" },
    ],
  },
  {
    title: "Error Handling",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: "text-red-400",
    items: [
      { subtype: "log", label: "Log Error", nodeType: "error_handler" as WorkflowNodeType },
      {
        subtype: "notify",
        label: "Notify on Error",
        nodeType: "error_handler" as WorkflowNodeType,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<WorkflowNodeType, { header: string; border: string; ring: string }> = {
  trigger: {
    header: "bg-amber-600",
    border: "border-amber-700/50",
    ring: "ring-amber-500/30",
  },
  condition: {
    header: "bg-blue-600",
    border: "border-blue-700/50",
    ring: "ring-blue-500/30",
  },
  action: {
    header: "bg-green-600",
    border: "border-green-700/50",
    ring: "ring-green-500/30",
  },
  transform: {
    header: "bg-purple-600",
    border: "border-purple-700/50",
    ring: "ring-purple-500/30",
  },
  error_handler: {
    header: "bg-red-600",
    border: "border-red-700/50",
    ring: "ring-red-500/30",
  },
};

// ---------------------------------------------------------------------------
// Custom node component
// ---------------------------------------------------------------------------

function WorkflowNodeComponent({ data }: { data: WorkflowNode }) {
  const colors = NODE_COLORS[data.type] ?? NODE_COLORS.action;

  return (
    <div
      className={cn(
        "rounded-lg border shadow-lg min-w-[160px] bg-[var(--glass-bg,#141210)]",
        colors.border,
      )}
    >
      {/* Input handle (hidden for triggers) */}
      {data.type !== "trigger" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-neutral-400 !border-2 !border-neutral-700"
        />
      )}

      {/* Colored header */}
      <div
        className={cn(
          "px-3 py-1.5 rounded-t-lg text-[11px] font-semibold text-white",
          colors.header,
        )}
      >
        {data.label}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <span className="text-[10px] text-neutral-500">{data.subtype}</span>
        {data.config && Object.keys(data.config).length > 0 && (
          <p className="text-[10px] text-neutral-600 mt-1 truncate max-w-[140px]">
            {Object.entries(data.config)
              .slice(0, 2)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(", ")}
          </p>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-neutral-400 !border-2 !border-neutral-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node type registration
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNodeComponent,
};

// ---------------------------------------------------------------------------
// Helpers: convert between store model and React Flow model
// ---------------------------------------------------------------------------

function toFlowNodes(wfNodes: WorkflowNode[]): Node[] {
  return wfNodes.map((n) => ({
    id: n.id,
    type: "workflowNode",
    position: n.position,
    data: n,
  }));
}

function toFlowEdges(
  wfEdges: { id: string; source: string; target: string; label?: string }[],
): Edge[] {
  return wfEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: "#525252" },
  }));
}

// ---------------------------------------------------------------------------
// Palette sidebar
// ---------------------------------------------------------------------------

function PaletteSidebar() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (title: string) => setCollapsed((s) => ({ ...s, [title]: !s[title] }));

  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/tigerpaw-workflow-node", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="w-[180px] shrink-0 border-r border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] overflow-y-auto">
      <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
        Nodes
      </div>
      {PALETTE_GROUPS.map((group) => (
        <div key={group.title} className="mb-1">
          <button
            onClick={() => toggle(group.title)}
            className={cn(
              "w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer hover:bg-[var(--glass-subtle-hover)] transition-colors duration-150",
              group.color,
            )}
          >
            {group.icon}
            {group.title}
            <span className="ml-auto text-neutral-700 text-[10px]">
              {collapsed[group.title] ? "+" : "\u2212"}
            </span>
          </button>
          {!collapsed[group.title] && (
            <div className="px-2 pb-1 space-y-0.5">
              {group.items.map((item) => (
                <div
                  key={item.subtype}
                  draggable
                  onDragStart={(e) => onDragStart(e, item)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-grab active:cursor-grabbing transition-colors duration-150 select-none"
                >
                  <Plus className="w-3 h-3 text-neutral-700" />
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Node config field schemas (defines which fields appear in the inspector)
// ---------------------------------------------------------------------------

const NODE_CONFIG_FIELDS: Record<
  string,
  Array<{
    key: string;
    label: string;
    type: "text" | "number" | "select" | "textarea";
    options?: string[];
    placeholder?: string;
  }>
> = {
  // Triggers
  cron: [
    { key: "expression", label: "Cron Expression", type: "text", placeholder: "0 18 * * *" },
    { key: "timezone", label: "Timezone", type: "text", placeholder: "UTC" },
  ],
  "trading.event": [
    { key: "event", label: "Event Type", type: "text", placeholder: "trading.order.denied" },
  ],
  "message.received": [
    { key: "channel", label: "Channel Filter", type: "text", placeholder: "discord" },
    { key: "sender", label: "Sender Filter", type: "text" },
  ],
  webhook: [{ key: "path", label: "Webhook Path", type: "text", placeholder: "/hooks/my-trigger" }],
  // Conditions
  contains_keyword: [
    { key: "keyword", label: "Keyword", type: "text" },
    { key: "caseSensitive", label: "Case Sensitive", type: "select", options: ["false", "true"] },
  ],
  sender_matches: [{ key: "pattern", label: "Pattern (regex)", type: "text" }],
  channel_is: [{ key: "channel", label: "Channel", type: "text" }],
  time_of_day: [
    { key: "after", label: "After (HH:MM)", type: "text", placeholder: "09:00" },
    { key: "before", label: "Before (HH:MM)", type: "text", placeholder: "17:00" },
    { key: "timezone", label: "Timezone", type: "text", placeholder: "UTC" },
  ],
  expression: [
    { key: "left", label: "Left Value", type: "text", placeholder: "$symbol" },
    {
      key: "operator",
      label: "Operator",
      type: "select",
      options: [
        "==",
        "!=",
        ">",
        ">=",
        "<",
        "<=",
        "contains",
        "starts_with",
        "ends_with",
        "matches",
      ],
    },
    { key: "right", label: "Right Value", type: "text" },
  ],
  // Actions
  send_message: [
    { key: "channel", label: "Channel", type: "text", placeholder: "discord" },
    { key: "to", label: "To", type: "text", placeholder: "#channel or user" },
    {
      key: "template",
      label: "Message Template",
      type: "textarea",
      placeholder: "Order {{symbol}} was {{status}}",
    },
  ],
  call_webhook: [
    { key: "url", label: "URL", type: "text", placeholder: "https://..." },
    {
      key: "method",
      label: "Method",
      type: "select",
      options: ["POST", "GET", "PUT", "PATCH", "DELETE"],
    },
    { key: "body", label: "Body (JSON)", type: "textarea" },
  ],
  run_llm_task: [
    {
      key: "prompt",
      label: "Prompt Template",
      type: "textarea",
      placeholder: "Summarize: {{text}}",
    },
    { key: "model", label: "Model", type: "text", placeholder: "default" },
  ],
  killswitch: [
    { key: "mode", label: "Mode", type: "select", options: ["activate", "deactivate", "check"] },
    { key: "reason", label: "Reason", type: "text" },
    { key: "switchMode", label: "Switch Mode", type: "select", options: ["hard", "soft"] },
  ],
  trade: [
    { key: "extensionId", label: "Extension ID", type: "text" },
    { key: "symbol", label: "Symbol", type: "text", placeholder: "AAPL" },
    { key: "side", label: "Side", type: "select", options: ["buy", "sell"] },
    { key: "quantity", label: "Quantity", type: "number" },
    { key: "orderType", label: "Order Type", type: "select", options: ["market", "limit"] },
  ],
  run_workflow: [{ key: "workflowId", label: "Workflow ID", type: "text", placeholder: "wf-..." }],
  // Transforms
  extract_data: [
    { key: "path", label: "Data Path", type: "text", placeholder: "event.payload.symbol" },
    { key: "outputKey", label: "Output Key", type: "text", placeholder: "extracted" },
  ],
  format_text: [
    {
      key: "template",
      label: "Template",
      type: "textarea",
      placeholder: "Symbol: {{symbol}}, Price: {{price}}",
    },
    { key: "outputKey", label: "Output Key", type: "text", placeholder: "formatted" },
  ],
  parse_json: [
    { key: "inputKey", label: "Input Key", type: "text", placeholder: "webhookResponse" },
    { key: "outputKey", label: "Output Key", type: "text", placeholder: "parsed" },
  ],
  // Error handlers
  log: [{ key: "action", label: "Action", type: "text", placeholder: "log" }],
  notify: [
    { key: "action", label: "Action", type: "text", placeholder: "notify" },
    { key: "channel", label: "Channel", type: "text", placeholder: "discord" },
    {
      key: "template",
      label: "Message Template",
      type: "textarea",
      placeholder: "Error in {{error.nodeLabel}}: {{error.message}}",
    },
  ],
};

// ---------------------------------------------------------------------------
// Node Property Inspector
// ---------------------------------------------------------------------------

function NodePropertyInspector({
  node,
  allNodes,
  credentials,
  onUpdate,
  onDuplicate,
  onDelete,
  onClose,
}: {
  node: WorkflowNode;
  allNodes: WorkflowNode[];
  credentials: StoredCredentialMeta[];
  onUpdate: (updated: WorkflowNode) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("workflows");
  const fields = NODE_CONFIG_FIELDS[node.subtype] ?? [];
  const colors = NODE_COLORS[node.type] ?? NODE_COLORS.action;

  const updateConfig = (key: string, value: unknown) => {
    onUpdate({ ...node, config: { ...node.config, [key]: value } });
  };

  const updateRetry = (patch: Partial<RetryConfig>) => {
    const current: RetryConfig = node.retryConfig ?? {
      maxRetries: 0,
      backoff: "none",
      delayMs: 1000,
      maxDelayMs: 30000,
    };
    onUpdate({ ...node, retryConfig: { ...current, ...patch } });
  };

  const errorHandlerNodes = allNodes.filter((n) => n.type === "error_handler" && n.id !== node.id);

  return (
    <aside className="w-[260px] shrink-0 border-l border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5 text-neutral-500" />
          <span className="text-[11px] font-semibold text-neutral-400">Properties</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--glass-subtle-hover)] text-neutral-600 hover:text-neutral-400 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Node header */}
      <div
        className={cn(
          "mx-3 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-white",
          colors.header,
        )}
      >
        {node.label}
      </div>

      {/* Label */}
      <div className="px-3 pt-3 space-y-3">
        <div>
          <label className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold">
            Label
          </label>
          <Input
            value={node.label}
            onChange={(e) => onUpdate({ ...node, label: e.target.value })}
            className="h-7 text-xs mt-1 bg-[var(--glass-bg)] border-[var(--glass-border)]"
          />
        </div>

        {/* Config fields */}
        {fields.map((field) => (
          <div key={field.key}>
            <label className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                value={(node.config[field.key] as string | undefined) ?? ""}
                onChange={(e) => updateConfig(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full mt-1 px-2 py-1.5 text-xs rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-neutral-300 placeholder:text-neutral-700 resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
            ) : field.type === "select" ? (
              <select
                value={(node.config[field.key] as string | undefined) ?? field.options?.[0] ?? ""}
                onChange={(e) => updateConfig(field.key, e.target.value)}
                className="w-full mt-1 h-7 px-2 text-xs rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-neutral-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type={field.type}
                value={(node.config[field.key] as string | undefined) ?? ""}
                onChange={(e) =>
                  updateConfig(
                    field.key,
                    field.type === "number" ? Number(e.target.value) : e.target.value,
                  )
                }
                placeholder={field.placeholder}
                className="h-7 text-xs mt-1 bg-[var(--glass-bg)] border-[var(--glass-border)]"
              />
            )}
          </div>
        ))}

        {/* Error handler assignment (for action/transform nodes) */}
        {(node.type === "action" || node.type === "transform") && errorHandlerNodes.length > 0 && (
          <div>
            <label className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold">
              Error Handler
            </label>
            <select
              value={node.errorHandlerId ?? ""}
              onChange={(e) => onUpdate({ ...node, errorHandlerId: e.target.value || undefined })}
              className="w-full mt-1 h-7 px-2 text-xs rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-neutral-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
            >
              <option value="">None (fail-fast)</option>
              {errorHandlerNodes.map((eh) => (
                <option key={eh.id} value={eh.id}>
                  {eh.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Retry config (for action/transform nodes) */}
        {(node.type === "action" || node.type === "transform") && (
          <div className="border-t border-[var(--glass-border)] pt-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Retry Policy
              </label>
            </div>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-neutral-500 w-20 shrink-0">Retries</label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={node.retryConfig?.maxRetries ?? 0}
                  onChange={(e) => updateRetry({ maxRetries: Number(e.target.value) })}
                  className="h-6 text-xs bg-[var(--glass-bg)] border-[var(--glass-border)]"
                />
              </div>
              {(node.retryConfig?.maxRetries ?? 0) > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-neutral-500 w-20 shrink-0">Backoff</label>
                    <select
                      value={node.retryConfig?.backoff ?? "none"}
                      onChange={(e) =>
                        updateRetry({ backoff: e.target.value as RetryConfig["backoff"] })
                      }
                      className="flex-1 h-6 px-1 text-xs rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-neutral-300"
                    >
                      <option value="none">None</option>
                      <option value="linear">Linear</option>
                      <option value="exponential">Exponential</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-neutral-500 w-20 shrink-0">Delay (ms)</label>
                    <Input
                      type="number"
                      min={100}
                      value={node.retryConfig?.delayMs ?? 1000}
                      onChange={(e) => updateRetry({ delayMs: Number(e.target.value) })}
                      className="h-6 text-xs bg-[var(--glass-bg)] border-[var(--glass-border)]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-neutral-500 w-20 shrink-0">Max (ms)</label>
                    <Input
                      type="number"
                      min={100}
                      value={node.retryConfig?.maxDelayMs ?? 30000}
                      onChange={(e) => updateRetry({ maxDelayMs: Number(e.target.value) })}
                      className="h-6 text-xs bg-[var(--glass-bg)] border-[var(--glass-border)]"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Credential */}
        {node.type === "action" && (
          <div>
            <label className="text-[10px] text-neutral-600 uppercase tracking-wider font-semibold flex items-center gap-1">
              <KeyRound className="w-3 h-3" /> {t("credentialId")}
            </label>
            <select
              value={node.credentialId ?? ""}
              onChange={(e) => onUpdate({ ...node, credentialId: e.target.value || undefined })}
              className="mt-1 w-full h-7 text-xs rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-neutral-200 px-2"
            >
              <option value="">{t("noneSelected")}</option>
              {credentials.map((cred) => (
                <option key={cred.id} value={cred.id}>
                  {cred.name} ({t(`credentialTypes.${cred.type}`, cred.type)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions: duplicate / delete */}
        <div className="border-t border-[var(--glass-border)] pt-3 pb-3 flex items-center gap-2">
          <button
            onClick={onDuplicate}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-colors"
          >
            <Copy className="w-3 h-3" /> Duplicate
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Credential Vault Panel
// ---------------------------------------------------------------------------

const CREDENTIAL_TYPES = [
  "api_key",
  "oauth2",
  "basic_auth",
  "bearer_token",
  "webhook_secret",
  "custom",
] as const;

function CredentialVaultPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("workflows");
  const { fetchCredentials, saveCredential, deleteCredential, testVault } = useWorkflowStore();

  const [credentials, setCredentials] = useState<StoredCredentialMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    type: string;
    fields: Array<{ key: string; value: string }>;
    isNew: boolean;
  } | null>(null);
  const [vaultStatus, setVaultStatus] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const creds = await fetchCredentials();
    setCredentials(creds);
    setLoading(false);
  }, [fetchCredentials]);

  useEffect(() => {
    void refresh();
    void testVault().then(setVaultStatus);
  }, [refresh, testVault]);

  const handleNew = () => {
    setEditing({
      id: `cred-${Date.now().toString(36)}`,
      name: "",
      type: "api_key",
      fields: [{ key: "", value: "" }],
      isNew: true,
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) {
      return;
    }
    setSaving(true);
    const fields: Record<string, string> = {};
    for (const f of editing.fields) {
      if (f.key.trim()) {
        fields[f.key.trim()] = f.value;
      }
    }
    const ok = await saveCredential({
      id: editing.id,
      name: editing.name.trim(),
      type: editing.type,
      fields,
    });
    setSaving(false);
    if (ok) {
      setEditing(null);
      void refresh();
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteCredential(id);
    if (ok) {
      void refresh();
    }
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-neutral-900/95 backdrop-blur-lg border-l border-neutral-700/50 z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-700/50">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-neutral-200">{t("credentials")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {vaultStatus && (
            <span
              title={
                vaultStatus.ok ? t("vaultHealthy") : (vaultStatus.error ?? t("vaultUnhealthy"))
              }
            >
              {vaultStatus.ok ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              )}
            </span>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-800 cursor-pointer">
            <X className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {editing ? (
          /* ── Edit / Create Form ── */
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                {t("credentialName")}
              </label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="My API Key"
                className="h-7 text-xs mt-1 bg-neutral-800/50 border-neutral-700/50"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                {t("credentialType")}
              </label>
              <select
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                className="mt-1 w-full h-7 text-xs rounded-md bg-neutral-800/50 border border-neutral-700/50 text-neutral-200 px-2"
              >
                {CREDENTIAL_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {t(`credentialTypes.${ct}`, ct)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                  {t("credentialFields")}
                </label>
                <button
                  onClick={() =>
                    setEditing({ ...editing, fields: [...editing.fields, { key: "", value: "" }] })
                  }
                  className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  + {t("addField")}
                </button>
              </div>
              <div className="mt-1 space-y-1.5">
                {editing.fields.map((field, i) => (
                  <div key={i} className="flex gap-1">
                    <Input
                      value={field.key}
                      onChange={(e) => {
                        const next = [...editing.fields];
                        next[i] = { ...next[i], key: e.target.value };
                        setEditing({ ...editing, fields: next });
                      }}
                      placeholder={t("fieldName")}
                      className="h-6 text-[11px] flex-1 bg-neutral-800/50 border-neutral-700/50"
                    />
                    <Input
                      type="password"
                      value={field.value}
                      onChange={(e) => {
                        const next = [...editing.fields];
                        next[i] = { ...next[i], value: e.target.value };
                        setEditing({ ...editing, fields: next });
                      }}
                      placeholder={t("fieldValue")}
                      className="h-6 text-[11px] flex-1 bg-neutral-800/50 border-neutral-700/50"
                    />
                    {editing.fields.length > 1 && (
                      <button
                        onClick={() => {
                          const next = editing.fields.filter((_, j) => j !== i);
                          setEditing({ ...editing, fields: next });
                        }}
                        className="px-1 text-neutral-500 hover:text-red-400 cursor-pointer"
                        title={t("removeField")}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void handleSave()}
                disabled={saving || !editing.name.trim()}
                className="flex-1 h-7 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 cursor-pointer transition-colors"
              >
                {saving ? "..." : t("save")}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="h-7 px-3 text-xs rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 cursor-pointer transition-colors"
              >
                {t("back")}
              </button>
            </div>
          </div>
        ) : (
          /* ── Credential List ── */
          <>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
              </div>
            ) : credentials.length === 0 ? (
              <div className="text-center py-8">
                <KeyRound className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                <p className="text-xs text-neutral-500">{t("noCredentials")}</p>
                <p className="text-[10px] text-neutral-600 mt-1">{t("noCredentialsHint")}</p>
              </div>
            ) : (
              credentials.map((cred) => (
                <div
                  key={cred.id}
                  className="rounded-lg border border-neutral-700/40 bg-neutral-800/30 p-2.5 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
                      <span className="text-xs font-medium text-neutral-200 truncate">
                        {cred.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          setEditing({
                            id: cred.id,
                            name: cred.name,
                            type: cred.type,
                            fields: cred.fieldKeys.map((k) => ({ key: k, value: "" })),
                            isNew: false,
                          })
                        }
                        className="p-1 rounded hover:bg-neutral-700 cursor-pointer"
                        title={t("editCredential")}
                      >
                        <Settings2 className="w-3 h-3 text-neutral-400" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t("deleteConfirm"))) {
                            void handleDelete(cred.id);
                          }
                        }}
                        className="p-1 rounded hover:bg-neutral-700 cursor-pointer"
                        title={t("delete")}
                      >
                        <Trash2 className="w-3 h-3 text-neutral-500 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-500">
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-4 border-neutral-700/50 text-neutral-500"
                    >
                      {t(`credentialTypes.${cred.type}`, cred.type)}
                    </Badge>
                    <span>{cred.fieldKeys.length} fields</span>
                  </div>
                  <div className="mt-1 text-[10px] text-neutral-600 font-mono truncate">
                    {cred.id}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!editing && (
        <div className="p-3 border-t border-neutral-700/50">
          <button
            onClick={handleNew}
            className="w-full h-7 text-xs font-medium rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3 h-3" /> {t("addCredential")}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor page
// ---------------------------------------------------------------------------

export function WorkflowEditorPage() {
  const { t } = useTranslation("workflows");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    getWorkflow,
    addWorkflow,
    updateWorkflow,
    toggleWorkflow,
    executeWorkflow,
    isExecuting,
    exportWorkflow,
    importWorkflow,
    fetchVersions,
    rollbackVersion,
    fetchCredentials,
  } = useWorkflowStore();

  const isNew = id === "new";
  const existing = isNew ? undefined : getWorkflow(id ?? "");

  const [workflowName, setWorkflowName] = useState(existing?.name ?? "");
  const [workflowDesc] = useState(existing?.description ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [lastExecution, setLastExecution] = useState<WorkflowExecution | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersionMeta[]>([]);
  const [credentialsList, setCredentialsList] = useState<StoredCredentialMeta[]>([]);
  const testing = isExecuting === id;

  const initialNodes = useMemo(
    () => (existing ? toFlowNodes(existing.nodes) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo(
    () => (existing ? toFlowEdges(existing.edges) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Store a ref to the React Flow instance for coordinate conversion
  const reactFlowInstance = useRef<{
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
  } | null>(null);

  // Load existing workflow into state when id changes
  useEffect(() => {
    if (existing) {
      setWorkflowName(existing.name);
      setEnabled(existing.enabled);
      setNodes(toFlowNodes(existing.nodes));
      setEdges(toFlowEdges(existing.edges));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Fetch credentials for the node inspector dropdown
  useEffect(() => {
    void fetchCredentials().then(setCredentialsList);
  }, [fetchCredentials]);

  // Edge connection callback
  const onConnect: OnConnect = useCallback(
    (params) =>
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#525252" } }, eds)),
    [setEdges],
  );

  // Drag and drop: allow drop
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // Drag and drop: create node
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/tigerpaw-workflow-node");
      if (!raw) {
        return;
      }

      const item: PaletteItem = JSON.parse(raw);
      const position = reactFlowInstance.current
        ? reactFlowInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        : { x: e.clientX, y: e.clientY };

      const newNode: Node = {
        id: `n-${Date.now()}`,
        type: "workflowNode",
        position,
        data: {
          id: `n-${Date.now()}`,
          type: item.nodeType,
          subtype: item.subtype,
          label: item.label,
          config: {},
          position,
        } satisfies WorkflowNode,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  // Save handler
  const handleSave = () => {
    const wfNodes: WorkflowNode[] = nodes.map((n) => ({
      ...(n.data as WorkflowNode),
      position: n.position,
    }));
    const wfEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
    }));

    if (isNew) {
      const newId = `wf-${Date.now()}`;
      addWorkflow({
        id: newId,
        name: workflowName || "Untitled Workflow",
        description: workflowDesc,
        enabled,
        nodes: wfNodes,
        edges: wfEdges,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runCount: 0,
      });
    } else if (id) {
      updateWorkflow(id, {
        name: workflowName,
        description: workflowDesc,
        enabled,
        nodes: wfNodes,
        edges: wfEdges,
      });
    }

    void navigate("/workflows");
  };

  // Test handler — actually executes the workflow via gateway
  const handleTest = async () => {
    if (!id || isNew) {
      return;
    }
    // Save first so the gateway has the latest version
    handleSave();
    const execution = await executeWorkflow(id);
    if (execution) {
      setLastExecution(execution);
    }
  };

  // Export handler
  const handleExport = async () => {
    if (!id || isNew) {
      return;
    }
    const workflow = await exportWorkflow(id);
    if (workflow) {
      const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workflowName || "workflow"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Import handler
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }
      const text = await file.text();
      const imported = await importWorkflow(text);
      if (imported) {
        void navigate(`/workflows/${imported.id}`);
      }
    });
    input.click();
  };

  // Toggle enabled
  const handleToggle = () => {
    setEnabled((v) => !v);
    if (!isNew && id) {
      toggleWorkflow(id);
    }
  };

  // Node selection
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }
    const flowNode = nodes.find((n) => n.id === selectedNodeId);
    return flowNode ? (flowNode.data as WorkflowNode) : null;
  }, [selectedNodeId, nodes]);

  const allWfNodes = useMemo(() => nodes.map((n) => n.data as WorkflowNode), [nodes]);

  const handleNodeSelect = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNodeUpdate = useCallback(
    (updated: WorkflowNode) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === updated.id ? { ...n, data: { ...updated, position: n.position } } : n,
        ),
      );
    },
    [setNodes],
  );

  const handleNodeDuplicate = useCallback(() => {
    if (!selectedNode) {
      return;
    }
    const newId = `n-${Date.now()}`;
    const dup: Node = {
      id: newId,
      type: "workflowNode",
      position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      data: {
        ...selectedNode,
        id: newId,
        label: `${selectedNode.label} (copy)`,
        position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      },
    };
    setNodes((nds) => [...nds, dup]);
    setSelectedNodeId(newId);
  }, [selectedNode, setNodes]);

  const handleNodeDelete = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
    );
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  // Version history
  const handleShowVersions = useCallback(async () => {
    if (!id || isNew) {
      return;
    }
    const v = await fetchVersions(id);
    setVersions(v);
    setShowVersions(true);
    setShowCredentials(false);
  }, [id, isNew, fetchVersions]);

  const handleRollback = useCallback(
    async (version: number) => {
      if (!id) {
        return;
      }
      const restored = await rollbackVersion(id, version);
      if (restored) {
        setWorkflowName(restored.name);
        setEnabled(restored.enabled);
        setNodes(toFlowNodes(restored.nodes));
        setEdges(toFlowEdges(restored.edges));
        setShowVersions(false);
      }
    },
    [id, rollbackVersion, setNodes, setEdges],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-4 md:-m-6">
      {/* Palette sidebar */}
      <PaletteSidebar />

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {showCredentials && <CredentialVaultPanel onClose={() => setShowCredentials(false)} />}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={handleNodeSelect}
          onPaneClick={handlePaneClick}
          onInit={(instance) => {
            reactFlowInstance.current = instance;
          }}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: "var(--glass-bg, #0a0908)" }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#262420" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="!bg-[var(--glass-sidebar)] !border-[var(--glass-border)] !rounded-lg !shadow-lg [&>button]:!bg-transparent [&>button]:!border-[var(--glass-border)] [&>button]:!text-neutral-400 [&>button:hover]:!bg-[var(--glass-subtle-hover)]"
          />
          <MiniMap
            nodeColor={() => "#525252"}
            maskColor="rgba(0,0,0,0.7)"
            className="!bg-[var(--glass-sidebar)] !border-[var(--glass-border)] !rounded-lg"
          />

          {/* Top toolbar */}
          <Panel position="top-left" className="flex items-center gap-2 w-full pr-4">
            <div className="flex items-center gap-2 glass-panel rounded-xl px-3 py-2 border border-[var(--glass-border)] shadow-lg">
              {/* Back */}
              <button
                onClick={() => navigate("/workflows")}
                className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-colors duration-150"
                title={t("back", "Back to Workflows")}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Name input */}
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder={t("workflowName", "Workflow name...")}
                className="h-7 w-48 text-xs bg-transparent border-none focus:ring-0"
              />

              {/* Enable toggle */}
              <button
                onClick={handleToggle}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-200",
                  enabled
                    ? "bg-green-900/50 text-green-400 hover:bg-green-900/70"
                    : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700",
                )}
              >
                {enabled ? t("enabled", "Enabled") : t("disabled", "Disabled")}
              </button>

              <div className="w-px h-5 bg-[var(--glass-border)]" />

              {/* Test — real execution */}
              <button
                onClick={() => void handleTest()}
                disabled={testing || isNew}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-200",
                  testing
                    ? "bg-amber-900/40 text-amber-400"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)]",
                  (testing || isNew) && "opacity-50 cursor-not-allowed",
                )}
              >
                {testing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {testing ? t("running", "Running...") : t("test", "Test")}
              </button>

              <div className="w-px h-5 bg-[var(--glass-border)]" />

              {/* Import */}
              <button
                onClick={handleImport}
                className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-colors duration-150"
                title={t("import", "Import workflow JSON")}
              >
                <Upload className="w-3.5 h-3.5" />
              </button>

              {/* Export */}
              <button
                onClick={() => void handleExport()}
                disabled={isNew}
                className={cn(
                  "p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-colors duration-150",
                  isNew && "opacity-50 cursor-not-allowed",
                )}
                title={t("export", "Export workflow JSON")}
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-5 bg-[var(--glass-border)]" />

              {/* Version history */}
              <button
                onClick={() => void handleShowVersions()}
                disabled={isNew}
                className={cn(
                  "p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-colors duration-150",
                  isNew && "opacity-50 cursor-not-allowed",
                )}
                title="Version history"
              >
                <History className="w-3.5 h-3.5" />
              </button>

              {/* Credentials */}
              <button
                onClick={() => {
                  setShowCredentials((v) => !v);
                  setShowVersions(false);
                }}
                className={cn(
                  "p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] cursor-pointer transition-colors duration-150",
                  showCredentials && "text-amber-400 bg-[var(--glass-subtle-hover)]",
                )}
                title={t("credentials")}
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-medium cursor-pointer transition-colors duration-200"
              >
                <Save className="w-3 h-3" />
                {t("save", "Save")}
              </button>
            </div>

            {/* Node count badge */}
            <Badge variant="secondary" className="text-[10px]">
              {nodes.length} {nodes.length === 1 ? "node" : "nodes"}
            </Badge>

            {/* Last execution result badge */}
            {lastExecution && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] gap-1",
                  lastExecution.status === "completed" && "text-green-400",
                  lastExecution.status === "failed" && "text-red-400",
                )}
              >
                {lastExecution.status === "completed" ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {lastExecution.status === "completed" ? "Passed" : "Failed"}
                {lastExecution.durationMs != null && ` (${lastExecution.durationMs}ms)`}
              </Badge>
            )}
          </Panel>
        </ReactFlow>

        {/* Version history dropdown */}
        {showVersions && (
          <div className="border-t border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] px-4 py-3 max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Version History
              </h4>
              <button
                onClick={() => setShowVersions(false)}
                className="text-[10px] text-neutral-600 hover:text-neutral-400 cursor-pointer"
              >
                Close
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="text-[11px] text-neutral-600">No version history yet.</p>
            ) : (
              <div className="space-y-1">
                {versions.map((v) => (
                  <div
                    key={v.version}
                    className="flex items-center justify-between text-[11px] py-1 px-2 rounded hover:bg-[var(--glass-subtle-hover)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-400 font-medium">v{v.version}</span>
                      <span className="text-neutral-600">
                        {new Date(v.savedAt).toLocaleString()}
                      </span>
                      <span className="text-neutral-700">
                        {v.nodeCount} nodes, {v.edgeCount} edges
                      </span>
                      {v.description && (
                        <span className="text-neutral-500 italic">{v.description}</span>
                      )}
                    </div>
                    <button
                      onClick={() => void handleRollback(v.version)}
                      className="text-[10px] text-orange-400 hover:text-orange-300 cursor-pointer"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Execution result panel */}
        {lastExecution && (
          <div className="border-t border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] px-4 py-3 max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-neutral-300">Execution Result</h4>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px]",
                    lastExecution.status === "completed" ? "text-green-400" : "text-red-400",
                  )}
                >
                  {lastExecution.status}
                </Badge>
                {lastExecution.durationMs != null && (
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {lastExecution.durationMs}ms
                  </span>
                )}
              </div>
              <button
                onClick={() => setLastExecution(null)}
                className="text-[10px] text-neutral-600 hover:text-neutral-400 cursor-pointer"
              >
                Dismiss
              </button>
            </div>

            {lastExecution.error && (
              <p className="text-xs text-red-400 mb-2">{lastExecution.error}</p>
            )}

            <div className="space-y-1">
              {lastExecution.nodeResults.map((nr) => (
                <div key={nr.nodeId} className="flex items-center gap-2 text-[11px]">
                  {nr.status === "success" ? (
                    <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                  ) : nr.status === "error" ? (
                    <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-neutral-600 shrink-0" />
                  )}
                  <span className="text-neutral-400 font-medium">{nr.nodeLabel}</span>
                  <span className="text-neutral-600">{nr.nodeType}</span>
                  <span className="text-neutral-700">{nr.completedAt - nr.startedAt}ms</span>
                  {nr.error && <span className="text-red-400 truncate">{nr.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Node Property Inspector */}
      {selectedNode && (
        <NodePropertyInspector
          node={selectedNode}
          allNodes={allWfNodes}
          credentials={credentialsList}
          onUpdate={handleNodeUpdate}
          onDuplicate={handleNodeDuplicate}
          onDelete={handleNodeDelete}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
