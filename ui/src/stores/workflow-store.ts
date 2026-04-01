import { create } from "zustand";
import { gatewayRpc } from "@/lib/gateway-rpc";

export type WorkflowNodeType =
  | "trigger"
  | "condition"
  | "action"
  | "transform"
  | "error_handler"
  | "router"
  | "annotation";

export type BackoffStrategy = "none" | "linear" | "exponential";

export type RetryConfig = {
  maxRetries: number;
  backoff: BackoffStrategy;
  delayMs: number;
  maxDelayMs: number;
};

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  subtype: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  retryConfig?: RetryConfig;
  errorHandlerId?: string;
  credentialId?: string;
  outputs?: string[];
  disabled?: boolean;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  runCount: number;
  version?: number;
};

export type WorkflowVersionMeta = {
  version: number;
  savedAt: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
};

export type StoredCredentialMeta = {
  id: string;
  name: string;
  type: string;
  fieldKeys: string[];
  createdAt: string;
  updatedAt: string;
};

export type NodeExecutionResult = {
  nodeId: string;
  nodeLabel: string;
  nodeType: WorkflowNodeType;
  status: "success" | "error" | "skipped" | "retrying";
  startedAt: number;
  completedAt: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
  pinned?: boolean;
};

export type WorkflowItem = {
  json: Record<string, unknown>;
  binary?: Record<string, { data: string; mimeType: string; fileName?: string }>;
  sourceNodeId?: string;
};

export type WorkflowExecution = {
  id: string;
  workflowId: string;
  workflowName: string;
  triggeredBy: string;
  triggerData?: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  nodeResults: NodeExecutionResult[];
  error?: string;
  parentExecutionId?: string;
};

type WorkflowState = {
  workflows: Workflow[];
  demoMode: boolean;
  executionHistory: WorkflowExecution[];
  isExecuting: string | null; // workflow ID being executed

  // Data pinning
  pinnedNodeData: Record<string, Record<string, unknown>>;
  pinNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  unpinNodeData: (nodeId: string) => void;
  clearAllPins: () => void;

  // Debug replay
  replayExecutionId: string | null;
  loadExecutionForReplay: (workflowId: string, executionId: string) => Promise<boolean>;
  reRunFromNode: (workflowId: string, nodeId: string) => Promise<WorkflowExecution | null>;
  clearReplay: () => void;

  // Execute to node (single-node testing)
  executeToNode: (
    workflowId: string,
    targetNodeId: string,
    testData?: Record<string, unknown>,
  ) => Promise<WorkflowExecution | null>;

  setDemoMode: (enabled: boolean) => void;
  fetchWorkflows: () => Promise<void>;
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, patch: Partial<Omit<Workflow, "id">>) => void;
  deleteWorkflow: (id: string) => void;
  toggleWorkflow: (id: string) => void;
  getWorkflow: (id: string) => Workflow | undefined;

  // Execution
  executeWorkflow: (
    id: string,
    testData?: Record<string, unknown>,
  ) => Promise<WorkflowExecution | null>;
  fetchHistory: (workflowId?: string) => Promise<void>;

  // Import/Export
  importWorkflow: (json: string) => Promise<Workflow | null>;
  exportWorkflow: (id: string) => Promise<Record<string, unknown> | null>;

  // Version history
  fetchVersions: (workflowId: string) => Promise<WorkflowVersionMeta[]>;
  rollbackVersion: (workflowId: string, version: number) => Promise<Workflow | null>;

  // Credentials
  fetchCredentials: () => Promise<StoredCredentialMeta[]>;
  saveCredential: (credential: {
    id: string;
    name: string;
    type: string;
    fields: Record<string, string>;
  }) => Promise<boolean>;
  deleteCredential: (id: string) => Promise<boolean>;
  testVault: () => Promise<{ ok: boolean; error?: string }>;
};

const DEMO_WORKFLOWS: Workflow[] = [
  {
    id: "wf-trading-alert",
    name: "Trading Alert",
    description: "Send a Discord alert when a trade order is denied by the policy engine.",
    enabled: true,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "trading.order.denied",
        label: "Order Denied",
        config: { event: "trading.order.denied" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "send_message",
        label: "Send Discord Message",
        config: { channel: "discord", template: "Order {{symbol}} was denied: {{reason}}" },
        position: { x: 600, y: 200 },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-03-25T14:30:00Z",
    lastRunAt: "2026-03-26T09:15:00Z",
    runCount: 12,
  },
  {
    id: "wf-message-router",
    name: "Message Router",
    description: "Route incoming messages containing 'urgent' to a dedicated Slack channel.",
    enabled: true,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "message.received",
        label: "Message Received",
        config: { source: "any" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "condition",
        subtype: "contains_keyword",
        label: "Contains 'urgent'",
        config: { keyword: "urgent", caseSensitive: false },
        position: { x: 350, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "send_message",
        label: "Forward to Slack",
        config: { channel: "slack", target: "#urgent-alerts" },
        position: { x: 600, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", label: "match" },
    ],
    createdAt: "2026-03-15T08:00:00Z",
    updatedAt: "2026-03-24T11:20:00Z",
    lastRunAt: "2026-03-26T08:42:00Z",
    runCount: 45,
  },
  {
    id: "wf-daily-digest",
    name: "Daily Digest",
    description: "Generate an LLM summary of the day's activity and send it via Telegram at 6 PM.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "cron",
        label: "Cron Schedule",
        config: { expression: "0 18 * * *", timezone: "UTC" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "run_llm_task",
        label: "Run LLM Summary",
        config: { prompt: "Summarize today's activity", model: "default" },
        position: { x: 350, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "send_message",
        label: "Send Telegram",
        config: { channel: "telegram", chatId: "main" },
        position: { x: 600, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
    createdAt: "2026-03-18T12:00:00Z",
    updatedAt: "2026-03-18T12:00:00Z",
    runCount: 0,
  },
];

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  demoMode: false,
  executionHistory: [],
  isExecuting: null,
  pinnedNodeData: {},
  replayExecutionId: null,

  setDemoMode: (enabled) =>
    set({
      demoMode: enabled,
      workflows: enabled ? DEMO_WORKFLOWS : [],
      executionHistory: [],
    }),

  fetchWorkflows: async () => {
    try {
      const result = await gatewayRpc<{ workflows?: Workflow[] }>("workflows.list", {});
      if (
        result.ok &&
        Array.isArray(result.payload?.workflows) &&
        result.payload.workflows.length > 0
      ) {
        set({ workflows: result.payload.workflows, demoMode: false });
      }
    } catch {
      // Gateway offline — keep demo data
    }
  },

  addWorkflow: (workflow) => {
    set((s) => ({ workflows: [...s.workflows, workflow] }));
    if (!get().demoMode) {
      void gatewayRpc("workflows.save", { workflow });
    }
  },

  updateWorkflow: (id, patch) => {
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
      ),
    }));
    const updated = get().workflows.find((w) => w.id === id);
    if (updated && !get().demoMode) {
      void gatewayRpc("workflows.save", { workflow: updated });
    }
  },

  deleteWorkflow: (id) => {
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }));
    if (!get().demoMode) {
      void gatewayRpc("workflows.delete", { id });
    }
  },

  toggleWorkflow: (id) => {
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, enabled: !w.enabled, updatedAt: new Date().toISOString() } : w,
      ),
    }));
    if (!get().demoMode) {
      void gatewayRpc("workflows.toggle", { id });
    }
  },

  getWorkflow: (id) => get().workflows.find((w) => w.id === id),

  executeWorkflow: async (id, testData) => {
    const pinnedData = get().pinnedNodeData;
    set({ isExecuting: id });
    try {
      const result = await gatewayRpc<{ execution?: WorkflowExecution }>("workflows.execute", {
        id,
        testData,
        pinnedData: Object.keys(pinnedData).length > 0 ? pinnedData : undefined,
      });
      set({ isExecuting: null });
      if (result.ok && result.payload?.execution) {
        const execution = result.payload.execution;
        // Update the workflow's lastRunAt and runCount in local state
        set((s) => ({
          executionHistory: [execution, ...s.executionHistory].slice(0, 50),
          workflows: s.workflows.map((w) =>
            w.id === id
              ? {
                  ...w,
                  lastRunAt: new Date(execution.startedAt).toISOString(),
                  runCount: w.runCount + 1,
                }
              : w,
          ),
        }));
        return execution;
      }
      return null;
    } catch {
      set({ isExecuting: null });
      return null;
    }
  },

  fetchHistory: async (workflowId) => {
    try {
      const result = await gatewayRpc<{ executions?: WorkflowExecution[]; total?: number }>(
        "workflows.history",
        { workflowId, limit: 50 },
      );
      if (result.ok && Array.isArray(result.payload?.executions)) {
        set({ executionHistory: result.payload.executions });
      }
    } catch {
      // Gateway offline
    }
  },

  importWorkflow: async (json) => {
    try {
      const parsed = JSON.parse(json);
      const result = await gatewayRpc<{ workflow?: Workflow }>("workflows.import", {
        workflow: parsed,
      });
      if (result.ok && result.payload?.workflow) {
        const workflow = result.payload.workflow;
        set((s) => ({ workflows: [...s.workflows, workflow] }));
        return workflow;
      }
      return null;
    } catch {
      return null;
    }
  },

  exportWorkflow: async (id) => {
    try {
      const result = await gatewayRpc<{ workflow?: Record<string, unknown> }>("workflows.export", {
        id,
      });
      if (result.ok && result.payload?.workflow) {
        return result.payload.workflow;
      }
      return null;
    } catch {
      return null;
    }
  },

  fetchVersions: async (workflowId) => {
    try {
      const result = await gatewayRpc<{ versions?: WorkflowVersionMeta[]; total?: number }>(
        "workflows.versions.list",
        { workflowId, limit: 50 },
      );
      return result.ok && Array.isArray(result.payload?.versions) ? result.payload.versions : [];
    } catch {
      return [];
    }
  },

  rollbackVersion: async (workflowId, version) => {
    try {
      const result = await gatewayRpc<{ workflow?: Workflow }>("workflows.versions.rollback", {
        workflowId,
        version,
      });
      if (result.ok && result.payload?.workflow) {
        const restored = result.payload.workflow;
        set((s) => ({
          workflows: s.workflows.map((w) => (w.id === workflowId ? restored : w)),
        }));
        return restored;
      }
      return null;
    } catch {
      return null;
    }
  },

  fetchCredentials: async () => {
    try {
      const result = await gatewayRpc<{ credentials?: StoredCredentialMeta[] }>(
        "workflows.credentials.list",
        {},
      );
      return result.ok && Array.isArray(result.payload?.credentials)
        ? result.payload.credentials
        : [];
    } catch {
      return [];
    }
  },

  saveCredential: async (credential) => {
    try {
      const result = await gatewayRpc<{ ok?: boolean }>("workflows.credentials.save", {
        credential,
      });
      return result.ok;
    } catch {
      return false;
    }
  },

  deleteCredential: async (id) => {
    try {
      const result = await gatewayRpc<{ ok?: boolean }>("workflows.credentials.delete", { id });
      return result.ok;
    } catch {
      return false;
    }
  },

  pinNodeData: (nodeId, data) => {
    set((s) => ({
      pinnedNodeData: { ...s.pinnedNodeData, [nodeId]: data },
    }));
  },

  unpinNodeData: (nodeId) => {
    set((s) => {
      const { [nodeId]: _, ...rest } = s.pinnedNodeData;
      return { pinnedNodeData: rest };
    });
  },

  clearAllPins: () => {
    set({ pinnedNodeData: {} });
  },

  loadExecutionForReplay: async (workflowId, executionId) => {
    try {
      const result = await gatewayRpc<{ execution?: WorkflowExecution }>("workflows.execution", {
        workflowId,
        executionId,
      });
      if (!result.ok || !result.payload?.execution) {
        return false;
      }
      const execution = result.payload.execution;

      // Pin all node outputs from the execution
      const pinned: Record<string, Record<string, unknown>> = {};
      for (const nodeResult of execution.nodeResults) {
        if (nodeResult.output && nodeResult.status === "success") {
          pinned[nodeResult.nodeId] = nodeResult.output;
        }
      }

      set({
        pinnedNodeData: pinned,
        replayExecutionId: executionId,
        executionHistory: [
          execution,
          ...get().executionHistory.filter((e) => e.id !== executionId),
        ].slice(0, 50),
      });
      return true;
    } catch {
      return false;
    }
  },

  reRunFromNode: async (workflowId, nodeId) => {
    // Unpin target node + all downstream nodes, then execute
    // For simplicity, we unpin just the target node — downstream nodes will re-execute
    // because the engine traverses forward from the target
    const currentPins = { ...get().pinnedNodeData };
    delete currentPins[nodeId];
    set({ pinnedNodeData: currentPins });

    // Use executeToNode to run up to the target, then continue
    // Actually, for re-run-from-node, we want to run the FULL workflow
    // with everything before the target pinned and the target + downstream unpinned
    set({ isExecuting: workflowId });
    try {
      const pinnedData = get().pinnedNodeData;
      const result = await gatewayRpc<{ execution?: WorkflowExecution }>("workflows.execute", {
        id: workflowId,
        pinnedData: Object.keys(pinnedData).length > 0 ? pinnedData : undefined,
      });
      set({ isExecuting: null });
      if (result.ok && result.payload?.execution) {
        const execution = result.payload.execution;
        set((s) => ({
          executionHistory: [execution, ...s.executionHistory].slice(0, 50),
          workflows: s.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  lastRunAt: new Date(execution.startedAt).toISOString(),
                  runCount: w.runCount + 1,
                }
              : w,
          ),
        }));
        return execution;
      }
      return null;
    } catch {
      set({ isExecuting: null });
      return null;
    }
  },

  clearReplay: () => {
    set({ replayExecutionId: null, pinnedNodeData: {} });
  },

  executeToNode: async (workflowId, targetNodeId, testData) => {
    const pinnedData = get().pinnedNodeData;
    set({ isExecuting: workflowId });
    try {
      const result = await gatewayRpc<{ execution?: WorkflowExecution }>(
        "workflows.executeToNode",
        {
          id: workflowId,
          targetNodeId,
          testData,
          pinnedData: Object.keys(pinnedData).length > 0 ? pinnedData : undefined,
        },
      );
      set({ isExecuting: null });
      if (result.ok && result.payload?.execution) {
        const execution = result.payload.execution;
        set((s) => ({
          executionHistory: [execution, ...s.executionHistory].slice(0, 50),
          workflows: s.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  lastRunAt: new Date(execution.startedAt).toISOString(),
                  runCount: w.runCount + 1,
                }
              : w,
          ),
        }));
        return execution;
      }
      return null;
    } catch {
      set({ isExecuting: null });
      return null;
    }
  },

  testVault: async () => {
    try {
      const result = await gatewayRpc<{ ok?: boolean; error?: string }>(
        "workflows.credentials.test",
        {},
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: result.payload?.ok === true, error: result.payload?.error };
    } catch {
      return { ok: false, error: "Gateway unavailable" };
    }
  },
}));
