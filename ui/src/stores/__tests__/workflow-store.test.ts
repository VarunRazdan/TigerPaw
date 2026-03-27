import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore, type Workflow } from "../workflow-store";

const initialState = useWorkflowStore.getState();

describe("workflow-store", () => {
  beforeEach(() => {
    useWorkflowStore.setState(initialState, true);
  });

  it("initial state loads 3 demo workflows", () => {
    expect(useWorkflowStore.getState().workflows).toHaveLength(3);
  });

  it("demo workflows have expected ids", () => {
    const ids = useWorkflowStore.getState().workflows.map((w) => w.id);
    expect(ids).toContain("wf-trading-alert");
    expect(ids).toContain("wf-message-router");
    expect(ids).toContain("wf-daily-digest");
  });

  it("addWorkflow appends a new workflow", () => {
    const wf: Workflow = {
      id: "wf-test",
      name: "Test Workflow",
      description: "A test",
      enabled: false,
      nodes: [],
      edges: [],
      createdAt: "2026-03-26T00:00:00Z",
      updatedAt: "2026-03-26T00:00:00Z",
      runCount: 0,
    };

    useWorkflowStore.getState().addWorkflow(wf);
    const workflows = useWorkflowStore.getState().workflows;
    expect(workflows).toHaveLength(4);
    expect(workflows[3].id).toBe("wf-test");
  });

  it("updateWorkflow patches an existing workflow and updates timestamp", () => {
    const before = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-trading-alert")!;
    const oldUpdatedAt = before.updatedAt;

    useWorkflowStore.getState().updateWorkflow("wf-trading-alert", { name: "Renamed Alert" });

    const after = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-trading-alert")!;
    expect(after.name).toBe("Renamed Alert");
    expect(after.updatedAt).not.toBe(oldUpdatedAt);
    // Other fields unchanged
    expect(after.description).toBe(before.description);
  });

  it("updateWorkflow is a no-op for unknown id", () => {
    const before = useWorkflowStore.getState().workflows.map((w) => w.name);
    useWorkflowStore.getState().updateWorkflow("nonexistent", { name: "X" });
    const after = useWorkflowStore.getState().workflows.map((w) => w.name);
    expect(after).toEqual(before);
  });

  it("deleteWorkflow removes a workflow", () => {
    useWorkflowStore.getState().deleteWorkflow("wf-daily-digest");
    const workflows = useWorkflowStore.getState().workflows;
    expect(workflows).toHaveLength(2);
    expect(workflows.find((w) => w.id === "wf-daily-digest")).toBeUndefined();
  });

  it("deleteWorkflow is a no-op for unknown id", () => {
    useWorkflowStore.getState().deleteWorkflow("nonexistent");
    expect(useWorkflowStore.getState().workflows).toHaveLength(3);
  });

  it("toggleWorkflow flips enabled and updates timestamp", () => {
    const before = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-daily-digest")!;
    expect(before.enabled).toBe(false);

    useWorkflowStore.getState().toggleWorkflow("wf-daily-digest");

    const after = useWorkflowStore.getState().workflows.find((w) => w.id === "wf-daily-digest")!;
    expect(after.enabled).toBe(true);
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it("getWorkflow returns a workflow by id", () => {
    const wf = useWorkflowStore.getState().getWorkflow("wf-message-router");
    expect(wf).toBeDefined();
    expect(wf!.name).toBe("Message Router");
  });

  it("getWorkflow returns undefined for unknown id", () => {
    expect(useWorkflowStore.getState().getWorkflow("nonexistent")).toBeUndefined();
  });
});
