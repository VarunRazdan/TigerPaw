import {
  dalDeleteWorkflow,
  dalGetWorkflow,
  dalListWorkflows,
  dalSaveWorkflow,
  dalToggleWorkflow,
} from "../../dal/workflows.js";
import {
  listCredentials,
  getCredential,
  saveCredential,
  deleteCredential,
  testVault,
} from "../../workflows/credentials.js";
import { getWorkflowService } from "../../workflows/index.js";
import type { StoredCredential, Workflow } from "../../workflows/types.js";
import {
  listVersions,
  getVersion,
  rollbackToVersion,
  diffVersions,
  clearVersionHistory,
} from "../../workflows/versioning.js";
import { saveVersion } from "../../workflows/versioning.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const workflowsHandlers: GatewayRequestHandlers = {
  "workflows.list": async ({ respond }) => {
    try {
      const workflows = dalListWorkflows();
      respond(true, { workflows }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.get": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const workflow = dalGetWorkflow(id);
      if (!workflow) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflow not found"));
        return;
      }
      respond(true, { workflow }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.save": async ({ params, respond }) => {
    const workflow = params.workflow as Record<string, unknown> | undefined;
    if (!workflow || !workflow.id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflow with id is required"),
      );
      return;
    }
    try {
      // Save a version snapshot before overwriting
      const existing = dalGetWorkflow(workflow.id as string);
      if (existing) {
        try {
          saveVersion(existing, params.versionDescription as string | undefined);
        } catch {
          // Non-critical — skip version save
        }
      }

      // Increment version number
      workflow.version = ((workflow.version as number) ?? 0) + 1;

      dalSaveWorkflow(workflow as unknown as Workflow);
      // Re-register triggers if the workflow changed
      void getWorkflowService().onWorkflowChanged(workflow.id as string);
      respond(true, { ok: true, version: workflow.version }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.delete": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      dalDeleteWorkflow(id);
      void getWorkflowService().onWorkflowDeleted(id);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.toggle": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const workflow = dalToggleWorkflow(id);
      if (!workflow) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflow not found"));
        return;
      }
      // Update triggers for the toggled workflow
      void getWorkflowService().onWorkflowChanged(id);
      respond(true, { workflow }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  // ── Execution ─────────────────────────────────────────────────

  "workflows.execute": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const testData = params.testData as Record<string, unknown> | undefined;
      const execution = await getWorkflowService().executeManually(id, testData);
      respond(true, { execution }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  // ── Execution History ─────────────────────────────────────────

  "workflows.history": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    const limit = params.limit as number | undefined;
    const offset = params.offset as number | undefined;

    try {
      const result = workflowId
        ? getWorkflowService().getHistory(workflowId, { limit, offset })
        : getWorkflowService().getGlobalHistory({ limit, offset });
      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.execution": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    const executionId = params.executionId as string | undefined;
    if (!workflowId || !executionId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflowId and executionId are required"),
      );
      return;
    }
    try {
      const execution = getWorkflowService().getExecution(workflowId, executionId);
      if (!execution) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "execution not found"));
        return;
      }
      respond(true, { execution }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.clearHistory": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    if (!workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId is required"));
      return;
    }
    try {
      getWorkflowService().clearWorkflowHistory(workflowId);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.diagnostics": async ({ respond }) => {
    try {
      const diag = getWorkflowService().diagnostics();
      respond(true, diag, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  // ── Import / Export ───────────────────────────────────────────

  "workflows.import": async ({ params, respond }) => {
    const workflow = params.workflow as Record<string, unknown> | undefined;
    if (!workflow || !workflow.id || !workflow.nodes) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "valid workflow JSON with id and nodes is required"),
      );
      return;
    }
    try {
      // Assign a new ID to avoid conflicts
      const newId = `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      workflow.id = newId;
      workflow.createdAt = new Date().toISOString();
      workflow.updatedAt = new Date().toISOString();
      workflow.runCount = 0;
      delete workflow.lastRunAt;

      dalSaveWorkflow(workflow as unknown as Workflow);
      respond(true, { workflow }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.export": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const workflow = dalGetWorkflow(id);
      if (!workflow) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflow not found"));
        return;
      }
      // Strip runtime state for clean export
      const exported = { ...workflow } as Record<string, unknown>;
      delete exported.lastRunAt;
      exported.runCount = 0;
      respond(true, { workflow: exported }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  // ── Credential Vault ─────────────────────────────────────────

  "workflows.credentials.list": async ({ respond }) => {
    try {
      const credentials = listCredentials();
      respond(true, { credentials }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.credentials.get": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const credential = getCredential(id);
      if (!credential) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "credential not found"));
        return;
      }
      // Mask field values in response — only return keys
      const masked = {
        ...credential,
        fields: Object.fromEntries(Object.keys(credential.fields).map((k) => [k, "••••••"])),
      };
      respond(true, { credential: masked }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.credentials.save": async ({ params, respond }) => {
    const credential = params.credential as StoredCredential | undefined;
    if (!credential || !credential.id || !credential.name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "credential with id and name is required"),
      );
      return;
    }
    try {
      const now = new Date().toISOString();
      if (!credential.createdAt) {
        credential.createdAt = now;
      }
      credential.updatedAt = now;
      saveCredential(credential);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.credentials.delete": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const deleted = deleteCredential(id);
      respond(true, { ok: true, deleted }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.credentials.test": async ({ respond }) => {
    try {
      const result = testVault();
      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  // ── Version History ──────────────────────────────────────────

  "workflows.versions.list": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    if (!workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId is required"));
      return;
    }
    try {
      const result = listVersions(workflowId, {
        limit: params.limit as number | undefined,
        offset: params.offset as number | undefined,
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.versions.get": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    const version = params.version as number | undefined;
    if (!workflowId || !version) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflowId and version are required"),
      );
      return;
    }
    try {
      const snapshot = getVersion(workflowId, version);
      if (!snapshot) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "version not found"));
        return;
      }
      respond(true, { snapshot }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.versions.rollback": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    const version = params.version as number | undefined;
    if (!workflowId || !version) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflowId and version are required"),
      );
      return;
    }
    try {
      // Save current version as a snapshot before rolling back
      const current = dalGetWorkflow(workflowId);
      if (current) {
        try {
          saveVersion(current, `Before rollback to v${version}`);
        } catch {
          // Non-critical
        }
      }

      const restored = rollbackToVersion(workflowId, version);
      if (!restored) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "version not found"));
        return;
      }

      dalSaveWorkflow(restored);
      void getWorkflowService().onWorkflowChanged(workflowId);
      respond(true, { workflow: restored }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.versions.diff": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    const versionA = params.versionA as number | undefined;
    const versionB = params.versionB as number | undefined;
    if (!workflowId || !versionA || !versionB) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflowId, versionA, and versionB are required"),
      );
      return;
    }
    try {
      const diff = diffVersions(workflowId, versionA, versionB);
      if (!diff) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "one or both versions not found"),
        );
        return;
      }
      respond(true, { diff }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.versions.clear": async ({ params, respond }) => {
    const workflowId = params.workflowId as string | undefined;
    if (!workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId is required"));
      return;
    }
    try {
      clearVersionHistory(workflowId);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  // ── Webhooks ────────────────────────────────────────────────────

  "workflows.webhook": async ({ params, respond }) => {
    const path = params.path as string | undefined;
    if (!path) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }
    try {
      const body = (params.body ?? {}) as Record<string, unknown>;
      const headers = (params.headers ?? {}) as Record<string, string>;
      const service = getWorkflowService();
      const triggered = service.handleWebhook(path, body, headers);
      respond(true, { triggered }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },

  "workflows.webhooks.list": async ({ respond }) => {
    try {
      const webhooks = getWorkflowService().listWebhooks();
      respond(true, { webhooks }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          err instanceof Error ? err.message : String(err as string),
        ),
      );
    }
  },
};
