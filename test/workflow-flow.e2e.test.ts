import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayClient } from "../src/gateway/client.js";
import { connectGatewayClient } from "../src/gateway/test-helpers.e2e.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../src/utils/message-channel.js";
import {
  type GatewayInstance,
  spawnGatewayInstance,
  stopGatewayInstance,
} from "./helpers/gateway-e2e-harness.js";

const E2E_TIMEOUT_MS = 120_000;

function makeWorkflow(overrides?: Record<string, unknown>) {
  return {
    id: "wf-test-1",
    name: "Test Workflow",
    description: "E2E test workflow",
    enabled: true,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "manual",
        label: "Manual trigger",
        config: {},
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runCount: 0,
    ...overrides,
  };
}

describe("workflow flow e2e", { timeout: E2E_TIMEOUT_MS }, () => {
  let gw: GatewayInstance;
  let client: GatewayClient;

  beforeAll(async () => {
    gw = await spawnGatewayInstance("workflow-flow");
    client = await connectGatewayClient({
      url: `ws://127.0.0.1:${gw.port}`,
      token: gw.gatewayToken,
      clientName: GATEWAY_CLIENT_NAMES.CLI,
      clientDisplayName: "workflow-e2e",
      clientVersion: "1.0.0",
      platform: "test",
      mode: GATEWAY_CLIENT_MODES.CLI,
    });
  });

  afterAll(async () => {
    client?.stop();
    if (gw) {
      await stopGatewayInstance(gw);
    }
  });

  // ── CRUD ────────────────────────────────────────────────────────

  it("lists workflows when none exist", async () => {
    const res = await client.request<{ workflows: unknown[] }>("workflows.list", {});
    expect(res.workflows).toEqual([]);
  });

  it("saves a minimal workflow and retrieves it", async () => {
    const saveRes = await client.request<{ ok: boolean; version: number }>("workflows.save", {
      workflow: makeWorkflow(),
    });
    expect(saveRes.ok).toBe(true);
    expect(typeof saveRes.version).toBe("number");

    const getRes = await client.request<{ workflow: { id: string; name: string } }>(
      "workflows.get",
      { id: "wf-test-1" },
    );
    expect(getRes.workflow.id).toBe("wf-test-1");
    expect(getRes.workflow.name).toBe("Test Workflow");
  });

  it("lists workflows returns saved workflow", async () => {
    const res = await client.request<{ workflows: Array<{ id: string }> }>("workflows.list", {});
    expect(res.workflows.length).toBeGreaterThanOrEqual(1);
    expect(res.workflows.some((w) => w.id === "wf-test-1")).toBe(true);
  });

  it("updates existing workflow by saving with same id", async () => {
    const saveRes = await client.request<{ ok: boolean; version: number }>("workflows.save", {
      workflow: makeWorkflow({ name: "Updated Workflow", description: "Updated description" }),
    });
    expect(saveRes.ok).toBe(true);

    const getRes = await client.request<{ workflow: { name: string } }>("workflows.get", {
      id: "wf-test-1",
    });
    expect(getRes.workflow.name).toBe("Updated Workflow");
  });

  it("toggles workflow enabled/disabled", async () => {
    const res = await client.request<{ workflow: { id: string; enabled: boolean } }>(
      "workflows.toggle",
      { id: "wf-test-1" },
    );
    expect(res.workflow.id).toBe("wf-test-1");
    expect(typeof res.workflow.enabled).toBe("boolean");
  });

  // ── Execution History ───────────────────────────────────────────

  it("retrieves workflow execution history (may be empty)", async () => {
    const res = await client.request<{ executions?: unknown[]; total?: number }>(
      "workflows.history",
      { workflowId: "wf-test-1" },
    );
    expect(res).toBeDefined();
  });

  // ── Import / Export ─────────────────────────────────────────────

  it("imports a workflow from export", async () => {
    const res = await client.request<{ workflow: { id: string; name: string } }>(
      "workflows.import",
      {
        workflow: makeWorkflow({
          id: "wf-import-source",
          name: "Imported Workflow",
          enabled: false,
        }),
      },
    );
    expect(res.workflow.id).toBeTruthy();
    expect(res.workflow.id).not.toBe("wf-import-source");
    expect(res.workflow.name).toBe("Imported Workflow");
  });

  // ── Validation ──────────────────────────────────────────────────

  it("rejects save with missing id", async () => {
    await expect(
      client.request("workflows.save", { workflow: { name: "No ID" } }),
    ).rejects.toThrow();
  });

  it("rejects delete with missing id", async () => {
    await expect(client.request("workflows.delete", {})).rejects.toThrow();
  });

  // ── Diagnostics ─────────────────────────────────────────────────

  it("diagnostics returns health info", async () => {
    const res = await client.request("workflows.diagnostics", {});
    expect(res).toBeDefined();
  });

  // ── Webhooks ────────────────────────────────────────────────────

  it("webhooks list returns registered webhooks (may be empty)", async () => {
    const res = await client.request<{ webhooks: unknown[] }>("workflows.webhooks.list", {});
    expect(Array.isArray(res.webhooks)).toBe(true);
  });

  // ── Credentials ─────────────────────────────────────────────────

  it("workflow credentials operations", async () => {
    const listRes = await client.request<{ credentials: unknown[] }>(
      "workflows.credentials.list",
      {},
    );
    expect(Array.isArray(listRes.credentials)).toBe(true);
  });

  // ── Versions ────────────────────────────────────────────────────

  it("workflow version operations (list versions for a workflow)", async () => {
    const res = await client.request<{ versions?: unknown[]; total?: number }>(
      "workflows.versions.list",
      { workflowId: "wf-test-1" },
    );
    expect(res).toBeDefined();
  });

  // ── Delete (last to avoid interfering with earlier tests) ───────

  it("deletes workflow by id", async () => {
    const res = await client.request<{ ok: boolean }>("workflows.delete", { id: "wf-test-1" });
    expect(res.ok).toBe(true);

    // Verify it's gone
    await expect(client.request("workflows.get", { id: "wf-test-1" })).rejects.toThrow();
  });
});
