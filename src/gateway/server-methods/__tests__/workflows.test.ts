/**
 * Tests for the workflows gateway RPC handlers.
 *
 * Mocks dal/workflows, workflows/index, workflows/credentials,
 * and workflows/versioning to validate handler logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Mocks ────────────────────────────────────────────────────────

const mockDalListWorkflows = vi.fn();
const mockDalGetWorkflow = vi.fn();
const mockDalSaveWorkflow = vi.fn();
const mockDalDeleteWorkflow = vi.fn();
const mockDalToggleWorkflow = vi.fn();

vi.mock("../../../dal/workflows.js", () => ({
  dalListWorkflows: (...args: unknown[]) => mockDalListWorkflows(...args),
  dalGetWorkflow: (...args: unknown[]) => mockDalGetWorkflow(...args),
  dalSaveWorkflow: (...args: unknown[]) => mockDalSaveWorkflow(...args),
  dalDeleteWorkflow: (...args: unknown[]) => mockDalDeleteWorkflow(...args),
  dalToggleWorkflow: (...args: unknown[]) => mockDalToggleWorkflow(...args),
}));

const mockOnWorkflowChanged = vi.fn().mockResolvedValue(undefined);
const mockOnWorkflowDeleted = vi.fn().mockResolvedValue(undefined);
const mockExecuteManually = vi.fn();
const mockGetHistory = vi.fn();
const mockGetGlobalHistory = vi.fn();
const mockGetExecution = vi.fn();
const mockClearWorkflowHistory = vi.fn();
const mockDiagnostics = vi.fn();
const mockHandleWebhook = vi.fn();
const mockListWebhooks = vi.fn();

vi.mock("../../../workflows/index.js", () => ({
  getWorkflowService: () => ({
    onWorkflowChanged: mockOnWorkflowChanged,
    onWorkflowDeleted: mockOnWorkflowDeleted,
    executeManually: mockExecuteManually,
    getHistory: mockGetHistory,
    getGlobalHistory: mockGetGlobalHistory,
    getExecution: mockGetExecution,
    clearWorkflowHistory: mockClearWorkflowHistory,
    diagnostics: mockDiagnostics,
    handleWebhook: mockHandleWebhook,
    listWebhooks: mockListWebhooks,
  }),
}));

const mockListCredentials = vi.fn();
const mockGetCredential = vi.fn();
const mockSaveCredential = vi.fn();
const mockDeleteCredential = vi.fn();
const mockTestVault = vi.fn();

vi.mock("../../../workflows/credentials.js", () => ({
  listCredentials: (...args: unknown[]) => mockListCredentials(...args),
  getCredential: (...args: unknown[]) => mockGetCredential(...args),
  saveCredential: (...args: unknown[]) => mockSaveCredential(...args),
  deleteCredential: (...args: unknown[]) => mockDeleteCredential(...args),
  testVault: (...args: unknown[]) => mockTestVault(...args),
}));

const mockListVersions = vi.fn();
const mockGetVersion = vi.fn();
const mockRollbackToVersion = vi.fn();
const mockDiffVersions = vi.fn();
const mockClearVersionHistory = vi.fn();
const mockSaveVersion = vi.fn();

vi.mock("../../../workflows/versioning.js", () => ({
  listVersions: (...args: unknown[]) => mockListVersions(...args),
  getVersion: (...args: unknown[]) => mockGetVersion(...args),
  rollbackToVersion: (...args: unknown[]) => mockRollbackToVersion(...args),
  diffVersions: (...args: unknown[]) => mockDiffVersions(...args),
  clearVersionHistory: (...args: unknown[]) => mockClearVersionHistory(...args),
  saveVersion: (...args: unknown[]) => mockSaveVersion(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

function sampleWorkflow(overrides?: Record<string, unknown>) {
  return {
    id: "wf-1",
    name: "Test WF",
    description: "A test",
    enabled: true,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "manual",
        label: "Start",
        config: {},
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    runCount: 3,
    version: 2,
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────

let handlers: Record<string, (opts: GatewayRequestHandlerOptions) => Promise<void>>;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../workflows.js");
  handlers = mod.workflowsHandlers as typeof handlers;
});

// ── workflows.list ───────────────────────────────────────────────

describe("workflows.list", () => {
  it("returns list of workflows", async () => {
    const wfs = [sampleWorkflow(), sampleWorkflow({ id: "wf-2", name: "WF 2" })];
    mockDalListWorkflows.mockReturnValue(wfs);

    const { opts, respond } = makeOpts("workflows.list", {});
    await handlers["workflows.list"](opts);

    expect(respond).toHaveBeenCalledWith(true, { workflows: wfs }, undefined);
  });

  it("responds with error when dalListWorkflows throws", async () => {
    mockDalListWorkflows.mockImplementation(() => {
      throw new Error("read error");
    });

    const { opts, respond } = makeOpts("workflows.list", {});
    await handlers["workflows.list"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE", message: "read error" }),
    );
  });
});

// ── workflows.get ────────────────────────────────────────────────

describe("workflows.get", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.get", {});
    await handlers["workflows.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST", message: "id is required" }),
    );
  });

  it("returns 'workflow not found' for unknown id", async () => {
    mockDalGetWorkflow.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.get", { id: "wf-missing" });
    await handlers["workflows.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflow not found" }),
    );
  });

  it("returns workflow by id", async () => {
    const wf = sampleWorkflow();
    mockDalGetWorkflow.mockReturnValue(wf);

    const { opts, respond } = makeOpts("workflows.get", { id: "wf-1" });
    await handlers["workflows.get"](opts);

    expect(respond).toHaveBeenCalledWith(true, { workflow: wf }, undefined);
  });

  it("responds with error on throw", async () => {
    mockDalGetWorkflow.mockImplementation(() => {
      throw new Error("corrupt");
    });

    const { opts, respond } = makeOpts("workflows.get", { id: "wf-1" });
    await handlers["workflows.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.save ───────────────────────────────────────────────

describe("workflows.save", () => {
  it("rejects missing workflow", async () => {
    const { opts, respond } = makeOpts("workflows.save", {});
    await handlers["workflows.save"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflow with id is required" }),
    );
  });

  it("rejects workflow without id", async () => {
    const { opts, respond } = makeOpts("workflows.save", { workflow: { name: "no id" } });
    await handlers["workflows.save"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflow with id is required" }),
    );
  });

  it("saves workflow with version snapshot when existing", async () => {
    const existing = sampleWorkflow({ version: 3 });
    mockDalGetWorkflow.mockReturnValue(existing);

    const wf = { id: "wf-1", name: "Updated", version: 3 };
    const { opts, respond } = makeOpts("workflows.save", {
      workflow: wf,
      versionDescription: "v3 save",
    });
    await handlers["workflows.save"](opts);

    expect(mockSaveVersion).toHaveBeenCalledWith(existing, "v3 save");
    expect(mockDalSaveWorkflow).toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(true, { ok: true, version: 4 }, undefined);
  });

  it("saves new workflow (no existing version snapshot)", async () => {
    mockDalGetWorkflow.mockReturnValue(undefined);

    const wf = { id: "wf-new", name: "Brand New" };
    const { opts, respond } = makeOpts("workflows.save", { workflow: wf });
    await handlers["workflows.save"](opts);

    expect(mockSaveVersion).not.toHaveBeenCalled();
    expect(mockDalSaveWorkflow).toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(true, { ok: true, version: 1 }, undefined);
  });

  it("responds with error on throw", async () => {
    mockDalGetWorkflow.mockReturnValue(undefined);
    mockDalSaveWorkflow.mockImplementation(() => {
      throw new Error("disk full");
    });

    const { opts, respond } = makeOpts("workflows.save", { workflow: { id: "wf-1" } });
    await handlers["workflows.save"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.delete ─────────────────────────────────────────────

describe("workflows.delete", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.delete", {});
    await handlers["workflows.delete"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("deletes workflow and notifies service", async () => {
    const { opts, respond } = makeOpts("workflows.delete", { id: "wf-1" });
    await handlers["workflows.delete"](opts);

    expect(mockDalDeleteWorkflow).toHaveBeenCalledWith("wf-1");
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("responds with error on throw", async () => {
    mockDalDeleteWorkflow.mockImplementation(() => {
      throw new Error("locked");
    });

    const { opts, respond } = makeOpts("workflows.delete", { id: "wf-1" });
    await handlers["workflows.delete"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.toggle ─────────────────────────────────────────────

describe("workflows.toggle", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.toggle", {});
    await handlers["workflows.toggle"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("returns 'workflow not found' for unknown id", async () => {
    mockDalToggleWorkflow.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.toggle", { id: "wf-missing" });
    await handlers["workflows.toggle"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflow not found" }),
    );
  });

  it("toggles workflow and notifies service", async () => {
    const toggled = sampleWorkflow({ enabled: false });
    mockDalToggleWorkflow.mockReturnValue(toggled);

    const { opts, respond } = makeOpts("workflows.toggle", { id: "wf-1" });
    await handlers["workflows.toggle"](opts);

    expect(respond).toHaveBeenCalledWith(true, { workflow: toggled }, undefined);
  });

  it("responds with error on throw", async () => {
    mockDalToggleWorkflow.mockImplementation(() => {
      throw new Error("oops");
    });

    const { opts, respond } = makeOpts("workflows.toggle", { id: "wf-1" });
    await handlers["workflows.toggle"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.execute ────────────────────────────────────────────

describe("workflows.execute", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.execute", {});
    await handlers["workflows.execute"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("executes workflow manually with test data", async () => {
    const exec = { id: "exec-1", status: "completed" };
    mockExecuteManually.mockResolvedValue(exec);

    const { opts, respond } = makeOpts("workflows.execute", {
      id: "wf-1",
      testData: { price: 100 },
    });
    await handlers["workflows.execute"](opts);

    expect(mockExecuteManually).toHaveBeenCalledWith("wf-1", { price: 100 });
    expect(respond).toHaveBeenCalledWith(true, { execution: exec }, undefined);
  });

  it("responds with error on throw", async () => {
    mockExecuteManually.mockRejectedValue(new Error("timeout"));

    const { opts, respond } = makeOpts("workflows.execute", { id: "wf-1" });
    await handlers["workflows.execute"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.history ────────────────────────────────────────────

describe("workflows.history", () => {
  it("returns history for specific workflow", async () => {
    const result = { executions: [], total: 0 };
    mockGetHistory.mockReturnValue(result);

    const { opts, respond } = makeOpts("workflows.history", {
      workflowId: "wf-1",
      limit: 10,
      offset: 0,
    });
    await handlers["workflows.history"](opts);

    expect(mockGetHistory).toHaveBeenCalledWith("wf-1", { limit: 10, offset: 0 });
    expect(respond).toHaveBeenCalledWith(true, result, undefined);
  });

  it("returns global history when workflowId is omitted", async () => {
    const result = { executions: [{ id: "e1" }], total: 1 };
    mockGetGlobalHistory.mockReturnValue(result);

    const { opts, respond } = makeOpts("workflows.history", {});
    await handlers["workflows.history"](opts);

    expect(mockGetGlobalHistory).toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(true, result, undefined);
  });

  it("responds with error on throw", async () => {
    mockGetHistory.mockImplementation(() => {
      throw new Error("corrupt");
    });

    const { opts, respond } = makeOpts("workflows.history", { workflowId: "wf-1" });
    await handlers["workflows.history"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.execution ──────────────────────────────────────────

describe("workflows.execution", () => {
  it("rejects missing workflowId or executionId", async () => {
    const { opts, respond } = makeOpts("workflows.execution", { workflowId: "wf-1" });
    await handlers["workflows.execution"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId and executionId are required" }),
    );
  });

  it("returns 'execution not found' for unknown execution", async () => {
    mockGetExecution.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.execution", {
      workflowId: "wf-1",
      executionId: "e-missing",
    });
    await handlers["workflows.execution"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "execution not found" }),
    );
  });

  it("returns execution by id", async () => {
    const exec = { id: "e-1", status: "completed" };
    mockGetExecution.mockReturnValue(exec);

    const { opts, respond } = makeOpts("workflows.execution", {
      workflowId: "wf-1",
      executionId: "e-1",
    });
    await handlers["workflows.execution"](opts);

    expect(respond).toHaveBeenCalledWith(true, { execution: exec }, undefined);
  });

  it("responds with error on throw", async () => {
    mockGetExecution.mockImplementation(() => {
      throw new Error("db error");
    });

    const { opts, respond } = makeOpts("workflows.execution", {
      workflowId: "wf-1",
      executionId: "e-1",
    });
    await handlers["workflows.execution"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.clearHistory ───────────────────────────────────────

describe("workflows.clearHistory", () => {
  it("rejects missing workflowId", async () => {
    const { opts, respond } = makeOpts("workflows.clearHistory", {});
    await handlers["workflows.clearHistory"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId is required" }),
    );
  });

  it("clears history for workflow", async () => {
    const { opts, respond } = makeOpts("workflows.clearHistory", { workflowId: "wf-1" });
    await handlers["workflows.clearHistory"](opts);

    expect(mockClearWorkflowHistory).toHaveBeenCalledWith("wf-1");
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("responds with error on throw", async () => {
    mockClearWorkflowHistory.mockImplementation(() => {
      throw new Error("locked");
    });

    const { opts, respond } = makeOpts("workflows.clearHistory", { workflowId: "wf-1" });
    await handlers["workflows.clearHistory"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.diagnostics ────────────────────────────────────────

describe("workflows.diagnostics", () => {
  it("returns diagnostics data", async () => {
    const diag = { registeredTriggers: 5, activeExecutions: 1 };
    mockDiagnostics.mockReturnValue(diag);

    const { opts, respond } = makeOpts("workflows.diagnostics", {});
    await handlers["workflows.diagnostics"](opts);

    expect(respond).toHaveBeenCalledWith(true, diag, undefined);
  });

  it("responds with error on throw", async () => {
    mockDiagnostics.mockImplementation(() => {
      throw new Error("unavailable");
    });

    const { opts, respond } = makeOpts("workflows.diagnostics", {});
    await handlers["workflows.diagnostics"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.import ─────────────────────────────────────────────

describe("workflows.import", () => {
  it("rejects missing workflow", async () => {
    const { opts, respond } = makeOpts("workflows.import", {});
    await handlers["workflows.import"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "valid workflow JSON with id and nodes is required" }),
    );
  });

  it("rejects workflow without nodes", async () => {
    const { opts, respond } = makeOpts("workflows.import", { workflow: { id: "wf-1" } });
    await handlers["workflows.import"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "valid workflow JSON with id and nodes is required" }),
    );
  });

  it("assigns new ID and resets runtime fields", async () => {
    const wf = {
      id: "wf-original",
      nodes: [{ id: "n1" }],
      lastRunAt: "2025-01-01",
      runCount: 99,
    };

    const { opts, respond } = makeOpts("workflows.import", { workflow: wf });
    await handlers["workflows.import"](opts);

    expect(mockDalSaveWorkflow).toHaveBeenCalled();
    const savedArg = mockDalSaveWorkflow.mock.calls[0][0] as Record<string, unknown>;
    expect(savedArg.id).not.toBe("wf-original");
    expect(savedArg.id).toMatch(/^wf-/);
    expect(savedArg.runCount).toBe(0);
    expect(savedArg.lastRunAt).toBeUndefined();
    expect(savedArg.createdAt).toBeDefined();
    expect(savedArg.updatedAt).toBeDefined();
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ workflow: savedArg }),
      undefined,
    );
  });

  it("responds with error on throw", async () => {
    mockDalSaveWorkflow.mockImplementation(() => {
      throw new Error("write fail");
    });

    const { opts, respond } = makeOpts("workflows.import", {
      workflow: { id: "wf-1", nodes: [{ id: "n1" }] },
    });
    await handlers["workflows.import"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.export ─────────────────────────────────────────────

describe("workflows.export", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.export", {});
    await handlers["workflows.export"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("returns 'workflow not found' for unknown id", async () => {
    mockDalGetWorkflow.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.export", { id: "wf-missing" });
    await handlers["workflows.export"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflow not found" }),
    );
  });

  it("strips runtime fields from exported workflow", async () => {
    const wf = sampleWorkflow({ lastRunAt: "2026-03-30", runCount: 10 });
    mockDalGetWorkflow.mockReturnValue(wf);

    const { opts, respond } = makeOpts("workflows.export", { id: "wf-1" });
    await handlers["workflows.export"](opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as { workflow: Record<string, unknown> };
    expect(result.workflow.runCount).toBe(0);
    expect(result.workflow.lastRunAt).toBeUndefined();
    expect(result.workflow.id).toBe("wf-1");
  });

  it("responds with error on throw", async () => {
    mockDalGetWorkflow.mockImplementation(() => {
      throw new Error("corrupt");
    });

    const { opts, respond } = makeOpts("workflows.export", { id: "wf-1" });
    await handlers["workflows.export"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.credentials.list ───────────────────────────────────

describe("workflows.credentials.list", () => {
  it("returns credentials list", async () => {
    const creds = [{ id: "c1", name: "API Key" }];
    mockListCredentials.mockReturnValue(creds);

    const { opts, respond } = makeOpts("workflows.credentials.list", {});
    await handlers["workflows.credentials.list"](opts);

    expect(respond).toHaveBeenCalledWith(true, { credentials: creds }, undefined);
  });

  it("responds with error on throw", async () => {
    mockListCredentials.mockImplementation(() => {
      throw new Error("vault locked");
    });

    const { opts, respond } = makeOpts("workflows.credentials.list", {});
    await handlers["workflows.credentials.list"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.credentials.get ────────────────────────────────────

describe("workflows.credentials.get", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.credentials.get", {});
    await handlers["workflows.credentials.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("returns 'credential not found' for unknown id", async () => {
    mockGetCredential.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.credentials.get", { id: "c-missing" });
    await handlers["workflows.credentials.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "credential not found" }),
    );
  });

  it("masks field values in response", async () => {
    const cred = {
      id: "c1",
      name: "My Key",
      type: "api_key",
      fields: { apiKey: "sk-secret-123", token: "tok-456" },
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    mockGetCredential.mockReturnValue(cred);

    const { opts, respond } = makeOpts("workflows.credentials.get", { id: "c1" });
    await handlers["workflows.credentials.get"](opts);

    const result = (respond.mock.calls[0] as unknown[])[1] as {
      credential: { id: string; fields: Record<string, string> };
    };
    expect(result.credential.fields.apiKey).toBe("••••••");
    expect(result.credential.fields.token).toBe("••••••");
    expect(result.credential.id).toBe("c1");
  });

  it("responds with error on throw", async () => {
    mockGetCredential.mockImplementation(() => {
      throw new Error("decrypt fail");
    });

    const { opts, respond } = makeOpts("workflows.credentials.get", { id: "c1" });
    await handlers["workflows.credentials.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.credentials.save ───────────────────────────────────

describe("workflows.credentials.save", () => {
  it("rejects missing credential", async () => {
    const { opts, respond } = makeOpts("workflows.credentials.save", {});
    await handlers["workflows.credentials.save"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "credential with id and name is required" }),
    );
  });

  it("rejects credential without name", async () => {
    const { opts, respond } = makeOpts("workflows.credentials.save", { credential: { id: "c1" } });
    await handlers["workflows.credentials.save"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "credential with id and name is required" }),
    );
  });

  it("sets timestamps and saves credential", async () => {
    const cred = { id: "c1", name: "My Key", type: "api_key", fields: { apiKey: "sk-123" } };

    const { opts, respond } = makeOpts("workflows.credentials.save", { credential: cred });
    await handlers["workflows.credentials.save"](opts);

    expect(mockSaveCredential).toHaveBeenCalled();
    const savedArg = mockSaveCredential.mock.calls[0][0] as Record<string, unknown>;
    expect(savedArg.createdAt).toBeDefined();
    expect(savedArg.updatedAt).toBeDefined();
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("preserves existing createdAt", async () => {
    const cred = { id: "c1", name: "My Key", type: "api_key", fields: {}, createdAt: "2025-01-01" };

    const { opts, respond } = makeOpts("workflows.credentials.save", { credential: cred });
    await handlers["workflows.credentials.save"](opts);

    const savedArg = mockSaveCredential.mock.calls[0][0] as Record<string, unknown>;
    expect(savedArg.createdAt).toBe("2025-01-01");
    expect(savedArg.updatedAt).toBeDefined();
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("responds with error on throw", async () => {
    mockSaveCredential.mockImplementation(() => {
      throw new Error("write error");
    });

    const cred = { id: "c1", name: "My Key", type: "api_key", fields: {} };
    const { opts, respond } = makeOpts("workflows.credentials.save", { credential: cred });
    await handlers["workflows.credentials.save"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.credentials.delete ─────────────────────────────────

describe("workflows.credentials.delete", () => {
  it("rejects missing id", async () => {
    const { opts, respond } = makeOpts("workflows.credentials.delete", {});
    await handlers["workflows.credentials.delete"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "id is required" }),
    );
  });

  it("deletes credential and returns result", async () => {
    mockDeleteCredential.mockReturnValue(true);

    const { opts, respond } = makeOpts("workflows.credentials.delete", { id: "c1" });
    await handlers["workflows.credentials.delete"](opts);

    expect(mockDeleteCredential).toHaveBeenCalledWith("c1");
    expect(respond).toHaveBeenCalledWith(true, { ok: true, deleted: true }, undefined);
  });

  it("responds with error on throw", async () => {
    mockDeleteCredential.mockImplementation(() => {
      throw new Error("locked");
    });

    const { opts, respond } = makeOpts("workflows.credentials.delete", { id: "c1" });
    await handlers["workflows.credentials.delete"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.credentials.test ───────────────────────────────────

describe("workflows.credentials.test", () => {
  it("returns vault test result", async () => {
    const result = { ok: true, backend: "file" };
    mockTestVault.mockReturnValue(result);

    const { opts, respond } = makeOpts("workflows.credentials.test", {});
    await handlers["workflows.credentials.test"](opts);

    expect(respond).toHaveBeenCalledWith(true, result, undefined);
  });

  it("responds with error on throw", async () => {
    mockTestVault.mockImplementation(() => {
      throw new Error("vault unavailable");
    });

    const { opts, respond } = makeOpts("workflows.credentials.test", {});
    await handlers["workflows.credentials.test"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.versions.list ──────────────────────────────────────

describe("workflows.versions.list", () => {
  it("rejects missing workflowId", async () => {
    const { opts, respond } = makeOpts("workflows.versions.list", {});
    await handlers["workflows.versions.list"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId is required" }),
    );
  });

  it("returns version list with pagination", async () => {
    const result = { versions: [{ version: 1 }, { version: 2 }], total: 2 };
    mockListVersions.mockReturnValue(result);

    const { opts, respond } = makeOpts("workflows.versions.list", {
      workflowId: "wf-1",
      limit: 10,
      offset: 0,
    });
    await handlers["workflows.versions.list"](opts);

    expect(mockListVersions).toHaveBeenCalledWith("wf-1", { limit: 10, offset: 0 });
    expect(respond).toHaveBeenCalledWith(true, result, undefined);
  });

  it("responds with error on throw", async () => {
    mockListVersions.mockImplementation(() => {
      throw new Error("read error");
    });

    const { opts, respond } = makeOpts("workflows.versions.list", { workflowId: "wf-1" });
    await handlers["workflows.versions.list"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.versions.get ───────────────────────────────────────

describe("workflows.versions.get", () => {
  it("rejects missing workflowId or version", async () => {
    const { opts, respond } = makeOpts("workflows.versions.get", { workflowId: "wf-1" });
    await handlers["workflows.versions.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId and version are required" }),
    );
  });

  it("returns 'version not found' for unknown version", async () => {
    mockGetVersion.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.versions.get", {
      workflowId: "wf-1",
      version: 99,
    });
    await handlers["workflows.versions.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "version not found" }),
    );
  });

  it("returns version snapshot", async () => {
    const snapshot = { version: 2, workflow: sampleWorkflow(), savedAt: "2026-01-01" };
    mockGetVersion.mockReturnValue(snapshot);

    const { opts, respond } = makeOpts("workflows.versions.get", {
      workflowId: "wf-1",
      version: 2,
    });
    await handlers["workflows.versions.get"](opts);

    expect(respond).toHaveBeenCalledWith(true, { snapshot }, undefined);
  });

  it("responds with error on throw", async () => {
    mockGetVersion.mockImplementation(() => {
      throw new Error("corrupt");
    });

    const { opts, respond } = makeOpts("workflows.versions.get", {
      workflowId: "wf-1",
      version: 1,
    });
    await handlers["workflows.versions.get"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.versions.rollback ──────────────────────────────────

describe("workflows.versions.rollback", () => {
  it("rejects missing workflowId or version", async () => {
    const { opts, respond } = makeOpts("workflows.versions.rollback", { workflowId: "wf-1" });
    await handlers["workflows.versions.rollback"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId and version are required" }),
    );
  });

  it("saves current version before rollback", async () => {
    const current = sampleWorkflow();
    mockDalGetWorkflow.mockReturnValue(current);
    const restored = sampleWorkflow({ version: 1 });
    mockRollbackToVersion.mockReturnValue(restored);

    const { opts, respond } = makeOpts("workflows.versions.rollback", {
      workflowId: "wf-1",
      version: 1,
    });
    await handlers["workflows.versions.rollback"](opts);

    expect(mockSaveVersion).toHaveBeenCalledWith(current, "Before rollback to v1");
    expect(mockDalSaveWorkflow).toHaveBeenCalledWith(restored);
    expect(respond).toHaveBeenCalledWith(true, { workflow: restored }, undefined);
  });

  it("returns 'version not found' when rollback target missing", async () => {
    mockDalGetWorkflow.mockReturnValue(sampleWorkflow());
    mockRollbackToVersion.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.versions.rollback", {
      workflowId: "wf-1",
      version: 99,
    });
    await handlers["workflows.versions.rollback"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "version not found" }),
    );
  });

  it("responds with error on throw", async () => {
    mockDalGetWorkflow.mockReturnValue(sampleWorkflow());
    mockRollbackToVersion.mockImplementation(() => {
      throw new Error("rollback fail");
    });

    const { opts, respond } = makeOpts("workflows.versions.rollback", {
      workflowId: "wf-1",
      version: 1,
    });
    await handlers["workflows.versions.rollback"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.versions.diff ──────────────────────────────────────

describe("workflows.versions.diff", () => {
  it("rejects missing params", async () => {
    const { opts, respond } = makeOpts("workflows.versions.diff", {
      workflowId: "wf-1",
      versionA: 1,
    });
    await handlers["workflows.versions.diff"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId, versionA, and versionB are required" }),
    );
  });

  it("returns 'one or both versions not found' when diff unavailable", async () => {
    mockDiffVersions.mockReturnValue(undefined);

    const { opts, respond } = makeOpts("workflows.versions.diff", {
      workflowId: "wf-1",
      versionA: 1,
      versionB: 2,
    });
    await handlers["workflows.versions.diff"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "one or both versions not found" }),
    );
  });

  it("returns diff between two versions", async () => {
    const diff = { added: ["n2"], removed: [], changed: ["n1"] };
    mockDiffVersions.mockReturnValue(diff);

    const { opts, respond } = makeOpts("workflows.versions.diff", {
      workflowId: "wf-1",
      versionA: 1,
      versionB: 2,
    });
    await handlers["workflows.versions.diff"](opts);

    expect(mockDiffVersions).toHaveBeenCalledWith("wf-1", 1, 2);
    expect(respond).toHaveBeenCalledWith(true, { diff }, undefined);
  });

  it("responds with error on throw", async () => {
    mockDiffVersions.mockImplementation(() => {
      throw new Error("diff fail");
    });

    const { opts, respond } = makeOpts("workflows.versions.diff", {
      workflowId: "wf-1",
      versionA: 1,
      versionB: 2,
    });
    await handlers["workflows.versions.diff"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.versions.clear ─────────────────────────────────────

describe("workflows.versions.clear", () => {
  it("rejects missing workflowId", async () => {
    const { opts, respond } = makeOpts("workflows.versions.clear", {});
    await handlers["workflows.versions.clear"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "workflowId is required" }),
    );
  });

  it("clears version history", async () => {
    const { opts, respond } = makeOpts("workflows.versions.clear", { workflowId: "wf-1" });
    await handlers["workflows.versions.clear"](opts);

    expect(mockClearVersionHistory).toHaveBeenCalledWith("wf-1");
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });

  it("responds with error on throw", async () => {
    mockClearVersionHistory.mockImplementation(() => {
      throw new Error("locked");
    });

    const { opts, respond } = makeOpts("workflows.versions.clear", { workflowId: "wf-1" });
    await handlers["workflows.versions.clear"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.webhook ────────────────────────────────────────────

describe("workflows.webhook", () => {
  it("rejects missing path", async () => {
    const { opts, respond } = makeOpts("workflows.webhook", {});
    await handlers["workflows.webhook"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "path is required" }),
    );
  });

  it("handles webhook and returns triggered count", async () => {
    mockHandleWebhook.mockReturnValue(2);

    const { opts, respond } = makeOpts("workflows.webhook", {
      path: "/hooks/my-hook",
      body: { data: "test" },
      headers: { "x-custom": "val" },
    });
    await handlers["workflows.webhook"](opts);

    expect(mockHandleWebhook).toHaveBeenCalledWith(
      "/hooks/my-hook",
      { data: "test" },
      { "x-custom": "val" },
    );
    expect(respond).toHaveBeenCalledWith(true, { triggered: 2 }, undefined);
  });

  it("responds with error on throw", async () => {
    mockHandleWebhook.mockImplementation(() => {
      throw new Error("webhook fail");
    });

    const { opts, respond } = makeOpts("workflows.webhook", { path: "/hooks/test" });
    await handlers["workflows.webhook"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── workflows.webhooks.list ──────────────────────────────────────

describe("workflows.webhooks.list", () => {
  it("returns list of registered webhooks", async () => {
    const webhooks = [{ path: "/hooks/a", workflowId: "wf-1" }];
    mockListWebhooks.mockReturnValue(webhooks);

    const { opts, respond } = makeOpts("workflows.webhooks.list", {});
    await handlers["workflows.webhooks.list"](opts);

    expect(respond).toHaveBeenCalledWith(true, { webhooks }, undefined);
  });

  it("responds with error on throw", async () => {
    mockListWebhooks.mockImplementation(() => {
      throw new Error("unavailable");
    });

    const { opts, respond } = makeOpts("workflows.webhooks.list", {});
    await handlers["workflows.webhooks.list"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});
