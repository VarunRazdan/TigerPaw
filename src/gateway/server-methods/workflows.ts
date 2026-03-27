import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const WORKFLOWS_DIR = join(homedir(), ".tigerpaw", "workflows");

function ensureDir(): void {
  if (!existsSync(WORKFLOWS_DIR)) {
    mkdirSync(WORKFLOWS_DIR, { recursive: true });
  }
}

function listWorkflows(): unknown[] {
  ensureDir();
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(WORKFLOWS_DIR, f), "utf-8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function saveWorkflow(workflow: Record<string, unknown>): void {
  ensureDir();
  const id = workflow.id as string;
  writeFileSync(join(WORKFLOWS_DIR, `${id}.json`), JSON.stringify(workflow, null, 2), "utf-8");
}

export const workflowsHandlers: GatewayRequestHandlers = {
  "workflows.list": async ({ respond }) => {
    try {
      const workflows = listWorkflows();
      respond(true, { workflows }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "workflows.get": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const filePath = join(WORKFLOWS_DIR, `${id}.json`);
      if (!existsSync(filePath)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflow not found"));
        return;
      }
      const workflow = JSON.parse(readFileSync(filePath, "utf-8"));
      respond(true, { workflow }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
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
      saveWorkflow(workflow);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "workflows.delete": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const filePath = join(WORKFLOWS_DIR, `${id}.json`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "workflows.toggle": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const filePath = join(WORKFLOWS_DIR, `${id}.json`);
      if (!existsSync(filePath)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflow not found"));
        return;
      }
      const workflow = JSON.parse(readFileSync(filePath, "utf-8"));
      workflow.enabled = !workflow.enabled;
      workflow.updatedAt = new Date().toISOString();
      writeFileSync(filePath, JSON.stringify(workflow, null, 2), "utf-8");
      respond(true, { workflow }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
