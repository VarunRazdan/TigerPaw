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
import { Save, Play, ArrowLeft, Zap, GitBranch, Send, Shuffle, Plus } from "lucide-react";
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
    ],
  },
  {
    title: "Actions",
    icon: <Send className="w-3.5 h-3.5" />,
    color: "text-green-400",
    items: [
      { subtype: "send_message", label: "Send Message", nodeType: "action" },
      { subtype: "invoke_tool", label: "Invoke Tool", nodeType: "action" },
      { subtype: "call_webhook", label: "Call Webhook", nodeType: "action" },
      { subtype: "run_llm_task", label: "Run LLM Task", nodeType: "action" },
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
// Main editor page
// ---------------------------------------------------------------------------

export function WorkflowEditorPage() {
  const { t } = useTranslation("workflows");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getWorkflow, addWorkflow, updateWorkflow, toggleWorkflow } = useWorkflowStore();

  const isNew = id === "new";
  const existing = isNew ? undefined : getWorkflow(id ?? "");

  const [workflowName, setWorkflowName] = useState(existing?.name ?? "");
  const [workflowDesc] = useState(existing?.description ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [testing, setTesting] = useState(false);

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

  // Test handler
  const handleTest = () => {
    setTesting(true);
    setTimeout(() => setTesting(false), 1500);
  };

  // Toggle enabled
  const handleToggle = () => {
    setEnabled((v) => !v);
    if (!isNew && id) {
      toggleWorkflow(id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-4 md:-m-6">
      {/* Palette sidebar */}
      <PaletteSidebar />

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
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

              {/* Test */}
              <button
                onClick={handleTest}
                disabled={testing}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-200",
                  testing
                    ? "bg-amber-900/40 text-amber-400"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)]",
                )}
              >
                <Play className="w-3 h-3" />
                {testing ? t("running", "Running...") : t("test", "Test")}
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
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
