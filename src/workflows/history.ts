/**
 * Workflow execution history — file-based logging.
 *
 * Each execution is stored as a JSON file in ~/.tigerpaw/workflow-runs/{workflowId}/
 * with filename {executionId}.json. Supports listing, pagination, and cleanup.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkflowExecution } from "./types.js";

const RUNS_DIR = join(homedir(), ".tigerpaw", "workflow-runs");
const MAX_RUNS_PER_WORKFLOW = 100;

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function workflowRunsDir(workflowId: string): string {
  return join(RUNS_DIR, workflowId);
}

/** Save an execution result to disk. */
export function saveExecution(execution: WorkflowExecution): void {
  const dir = workflowRunsDir(execution.workflowId);
  ensureDir(dir);

  const filePath = join(dir, `${execution.id}.json`);
  writeFileSync(filePath, JSON.stringify(execution, null, 2), "utf-8");

  // Prune old runs if over limit
  pruneOldRuns(dir, MAX_RUNS_PER_WORKFLOW);
}

/** List executions for a workflow, newest first. */
export function listExecutions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
): { executions: WorkflowExecution[]; total: number } {
  const dir = workflowRunsDir(workflowId);
  if (!existsSync(dir)) {
    return { executions: [], total: 0 };
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const stat = statSync(join(dir, f));
      return { name: f, mtime: stat.mtimeMs };
    })
    .toSorted((a, b) => b.mtime - a.mtime); // newest first

  const total = files.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const slice = files.slice(offset, offset + limit);

  const executions: WorkflowExecution[] = [];
  for (const file of slice) {
    try {
      const raw = readFileSync(join(dir, file.name), "utf-8");
      executions.push(JSON.parse(raw));
    } catch {
      // Skip corrupt files
    }
  }

  return { executions, total };
}

/** Get a specific execution by ID. */
export function getExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  const filePath = join(workflowRunsDir(workflowId), `${executionId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/** List all executions across all workflows (for global history). */
export function listAllExecutions(opts?: { limit?: number; offset?: number }): {
  executions: WorkflowExecution[];
  total: number;
} {
  ensureDir(RUNS_DIR);

  const all: { execution: WorkflowExecution; mtime: number }[] = [];

  const workflowDirs = readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const wfId of workflowDirs) {
    const dir = join(RUNS_DIR, wfId);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        const execution = JSON.parse(readFileSync(filePath, "utf-8"));
        all.push({ execution, mtime: stat.mtimeMs });
      } catch {
        // Skip corrupt files
      }
    }
  }

  // Sort newest first
  all.sort((a, b) => b.mtime - a.mtime);

  const total = all.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const slice = all.slice(offset, offset + limit);

  return {
    executions: slice.map((s) => s.execution),
    total,
  };
}

/** Delete all execution history for a workflow. */
export function clearHistory(workflowId: string): void {
  const dir = workflowRunsDir(workflowId);
  if (!existsSync(dir)) {
    return;
  }

  for (const file of readdirSync(dir)) {
    try {
      unlinkSync(join(dir, file));
    } catch {
      // Ignore
    }
  }
}

/** Remove oldest runs when over the limit. */
function pruneOldRuns(dir: string, maxRuns: number): void {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const stat = statSync(join(dir, f));
      return { name: f, mtime: stat.mtimeMs };
    })
    .toSorted((a, b) => a.mtime - b.mtime); // oldest first

  const excess = files.length - maxRuns;
  if (excess <= 0) {
    return;
  }

  for (let i = 0; i < excess; i++) {
    try {
      unlinkSync(join(dir, files[i].name));
    } catch {
      // Ignore
    }
  }
}
