import { create } from "zustand";

export type WorkflowNodeType = "trigger" | "condition" | "action" | "transform";

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  subtype: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
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
};

type WorkflowState = {
  workflows: Workflow[];

  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, patch: Partial<Omit<Workflow, "id">>) => void;
  deleteWorkflow: (id: string) => void;
  toggleWorkflow: (id: string) => void;
  getWorkflow: (id: string) => Workflow | undefined;
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

  addWorkflow: (workflow) =>
    set((s) => ({
      workflows: [...s.workflows, workflow],
    })),

  updateWorkflow: (id, patch) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
      ),
    })),

  deleteWorkflow: (id) =>
    set((s) => ({
      workflows: s.workflows.filter((w) => w.id !== id),
    })),

  toggleWorkflow: (id) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, enabled: !w.enabled, updatedAt: new Date().toISOString() } : w,
      ),
    })),

  getWorkflow: (id) => get().workflows.find((w) => w.id === id),
}));
