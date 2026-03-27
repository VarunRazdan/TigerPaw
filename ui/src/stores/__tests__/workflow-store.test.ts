import { describe, it, expect, beforeEach, vi } from "vitest";
import { useWorkflowStore } from "../workflow-store";
import type { Workflow } from "../workflow-store";

// Mock the gateway-rpc module so tests don't need a real gateway
vi.mock("@/lib/gateway-rpc", () => ({
  gatewayRpc: vi.fn().mockResolvedValue({ ok: false, error: "not connected" }),
}));

const initialState = useWorkflowStore.getState();

const SAMPLE_WORKFLOW: Workflow = {
  id: "wf-test-1",
  name: "Test Workflow",
  description: "A test workflow",
  enabled: true,
  trigger: { type: "manual" },
  actions: [{ type: "notify", channel: "slack", message: "hello" }],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("workflow-store", () => {
  beforeEach(() => {
    useWorkflowStore.setState(initialState, true);
  });

  it("starts with demo workflows", () => {
    const { workflows } = useWorkflowStore.getState();
    expect(workflows.length).toBeGreaterThan(0);
  });

  describe("addWorkflow", () => {
    it("appends a workflow", () => {
      const before = useWorkflowStore.getState().workflows.length;
      useWorkflowStore.getState().addWorkflow(SAMPLE_WORKFLOW);
      expect(useWorkflowStore.getState().workflows).toHaveLength(before + 1);
      expect(useWorkflowStore.getState().workflows.find((w) => w.id === "wf-test-1")).toBeDefined();
    });
  });

  describe("updateWorkflow", () => {
    it("updates matching workflow", () => {
      useWorkflowStore.getState().addWorkflow(SAMPLE_WORKFLOW);
      useWorkflowStore.getState().updateWorkflow("wf-test-1", { name: "Updated" });
      const wf = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-test-1");
      expect(wf?.name).toBe("Updated");
    });

    it("sets updatedAt on update", () => {
      useWorkflowStore.getState().addWorkflow(SAMPLE_WORKFLOW);
      const before = useWorkflowStore
        .getState()
        .workflows.find((w) => w.id === "wf-test-1")!.updatedAt;
      useWorkflowStore.getState().updateWorkflow("wf-test-1", { name: "Changed" });
      const after = useWorkflowStore
        .getState()
        .workflows.find((w) => w.id === "wf-test-1")!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("no-op for unknown id", () => {
      const before = useWorkflowStore.getState().workflows.length;
      useWorkflowStore.getState().updateWorkflow("nonexistent", { name: "X" });
      expect(useWorkflowStore.getState().workflows).toHaveLength(before);
    });
  });

  describe("deleteWorkflow", () => {
    it("removes by id", () => {
      useWorkflowStore.getState().addWorkflow(SAMPLE_WORKFLOW);
      useWorkflowStore.getState().deleteWorkflow("wf-test-1");
      expect(
        useWorkflowStore.getState().workflows.find((w) => w.id === "wf-test-1"),
      ).toBeUndefined();
    });

    it("no-op for unknown id", () => {
      const before = useWorkflowStore.getState().workflows.length;
      useWorkflowStore.getState().deleteWorkflow("nonexistent");
      expect(useWorkflowStore.getState().workflows).toHaveLength(before);
    });
  });

  describe("toggleWorkflow", () => {
    it("flips enabled state", () => {
      useWorkflowStore.getState().addWorkflow({ ...SAMPLE_WORKFLOW, enabled: true });
      useWorkflowStore.getState().toggleWorkflow("wf-test-1");
      const wf = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-test-1");
      expect(wf?.enabled).toBe(false);

      useWorkflowStore.getState().toggleWorkflow("wf-test-1");
      const wf2 = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-test-1");
      expect(wf2?.enabled).toBe(true);
    });
  });

  describe("loadFromGateway", () => {
    it("keeps demo workflows when gateway returns error", async () => {
      const before = useWorkflowStore.getState().workflows.length;
      await useWorkflowStore.getState().loadFromGateway();
      expect(useWorkflowStore.getState().workflows).toHaveLength(before);
      expect(useWorkflowStore.getState().loading).toBe(false);
    });

    it("replaces workflows when gateway returns data", async () => {
      const { gatewayRpc } = await import("@/lib/gateway-rpc");
      const serverWorkflows: Workflow[] = [
        {
          id: "server-1",
          name: "From Server",
          description: "Loaded from gateway",
          enabled: true,
          trigger: { type: "manual" },
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      vi.mocked(gatewayRpc).mockResolvedValueOnce({ ok: true, payload: serverWorkflows });

      await useWorkflowStore.getState().loadFromGateway();
      expect(useWorkflowStore.getState().workflows).toEqual(serverWorkflows);
      expect(useWorkflowStore.getState().loading).toBe(false);
    });
  });
});
