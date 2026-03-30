/**
 * Workflow execution history — delegates to DAL.
 *
 * Public API remains unchanged for all consumers (engine, gateway handlers, service).
 */

import {
  dalSaveExecution,
  dalListExecutions,
  dalGetExecution,
  dalListAllExecutions,
  dalClearHistory,
} from "../dal/workflow-history.js";
import type { WorkflowExecution } from "./types.js";

/** Save an execution result. */
export function saveExecution(execution: WorkflowExecution): void {
  dalSaveExecution(execution);
}

/** List executions for a workflow, newest first. */
export function listExecutions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
): { executions: WorkflowExecution[]; total: number } {
  return dalListExecutions(workflowId, opts);
}

/** Get a specific execution by ID. */
export function getExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  return dalGetExecution(workflowId, executionId);
}

/** List all executions across all workflows (for global history). */
export function listAllExecutions(opts?: { limit?: number; offset?: number }): {
  executions: WorkflowExecution[];
  total: number;
} {
  return dalListAllExecutions(opts);
}

/** Delete all execution history for a workflow. */
export function clearHistory(workflowId: string): void {
  dalClearHistory(workflowId);
}
