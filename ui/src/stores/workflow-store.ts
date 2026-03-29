import { create } from "zustand";
import { gatewayRpc } from "@/lib/gateway-rpc";

export type WorkflowNodeType = "trigger" | "condition" | "action" | "transform" | "error_handler";

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
  output?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
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
  workflows: DEMO_WORKFLOWS,
  demoMode: true,
  executionHistory: [],
  isExecuting: null,

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
    set({ isExecuting: id });
    try {
      const result = await gatewayRpc<{ execution?: WorkflowExecution }>("workflows.execute", {
        id,
        testData,
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

  testVault: async () => {
    try {
      const result = await gatewayRpc<{ ok?: boolean; error?: string }>(
        "workflows.credentials.test",
        {},
      );
      return { ok: result.payload?.ok === true, error: result.payload?.error };
    } catch {
      return { ok: false, error: "Gateway unavailable" };
    }
  },
}));
