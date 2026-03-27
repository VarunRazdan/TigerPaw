import { create } from "zustand";
import { gatewayRpc } from "@/lib/gateway-rpc";

export type WorkflowTrigger =
  | { type: "schedule"; cron: string }
  | { type: "price"; symbol: string; condition: "above" | "below"; threshold: number }
  | { type: "event"; eventName: string }
  | { type: "manual" };

export type WorkflowAction =
  | { type: "trade"; extensionId: string; symbol: string; side: "buy" | "sell"; quantity: number }
  | { type: "notify"; channel: string; message: string }
  | { type: "killswitch"; mode: "activate" | "deactivate" }
  | { type: "webhook"; url: string; method: "GET" | "POST"; body?: string };

export type Workflow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  createdAt: number;
  updatedAt: number;
};

type WorkflowState = {
  workflows: Workflow[];
  loading: boolean;

  loadFromGateway: () => Promise<void>;
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, updates: Partial<Omit<Workflow, "id">>) => void;
  deleteWorkflow: (id: string) => void;
  toggleWorkflow: (id: string) => void;
};

const DEMO_WORKFLOWS: Workflow[] = [
  {
    id: "wf-demo-1",
    name: "Morning portfolio check",
    description: "Notify via Slack every weekday at 9:30 AM ET",
    enabled: true,
    trigger: { type: "schedule", cron: "30 9 * * 1-5" },
    actions: [{ type: "notify", channel: "slack", message: "Daily portfolio summary ready" }],
    createdAt: Date.now() - 86_400_000 * 7,
    updatedAt: Date.now() - 86_400_000 * 2,
  },
  {
    id: "wf-demo-2",
    name: "BTC crash guard",
    description: "Activate kill switch if BTC drops below $80,000",
    enabled: true,
    trigger: { type: "price", symbol: "BTC-USD", condition: "below", threshold: 80_000 },
    actions: [
      { type: "killswitch", mode: "activate" },
      { type: "notify", channel: "telegram", message: "Kill switch activated: BTC below $80k" },
    ],
    createdAt: Date.now() - 86_400_000 * 14,
    updatedAt: Date.now() - 86_400_000 * 5,
  },
  {
    id: "wf-demo-3",
    name: "AAPL dip buyer",
    description: "Buy 5 shares of AAPL if price drops below $200",
    enabled: false,
    trigger: { type: "price", symbol: "AAPL", condition: "below", threshold: 200 },
    actions: [{ type: "trade", extensionId: "alpaca", symbol: "AAPL", side: "buy", quantity: 5 }],
    createdAt: Date.now() - 86_400_000 * 3,
    updatedAt: Date.now() - 86_400_000 * 3,
  },
];

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: DEMO_WORKFLOWS,
  loading: false,

  loadFromGateway: async () => {
    set({ loading: true });
    try {
      const result = await gatewayRpc<Workflow[]>("workflow.list", {});
      if (result.ok) {
        set({ workflows: result.payload });
      }
    } catch {
      // Gateway unreachable — keep in-memory demo data
    } finally {
      set({ loading: false });
    }
  },

  addWorkflow: (workflow) => {
    set((s) => ({ workflows: [...s.workflows, workflow] }));
    gatewayRpc("workflow.save", { ...workflow }).catch(() => {});
  },

  updateWorkflow: (id, updates) => {
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w,
      ),
    }));

    const saved = get().workflows.find((w) => w.id === id);
    if (saved) {
      gatewayRpc("workflow.save", { ...saved }).catch(() => {});
    }
  },

  deleteWorkflow: (id) => {
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }));
    gatewayRpc("workflow.delete", { id }).catch(() => {});
  },

  toggleWorkflow: (id) => {
    const workflow = get().workflows.find((w) => w.id === id);
    if (workflow) {
      get().updateWorkflow(id, { enabled: !workflow.enabled });
    }
  },
}));
