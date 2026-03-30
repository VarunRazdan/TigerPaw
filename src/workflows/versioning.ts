/**
 * Workflow Version History — snapshot management.
 *
 * Delegates storage to the DAL (SQLite or flat-file fallback).
 * Public API remains unchanged for all consumers.
 */

import {
  dalSaveVersion,
  dalListVersions,
  dalGetVersion,
  dalClearVersionHistory,
} from "../dal/workflow-versions.js";
import type { Workflow, WorkflowVersion } from "./types.js";

// ── Public API ────────────────────────────────────────────────────

/**
 * Save a version snapshot of a workflow.
 * Returns the version number assigned.
 */
export function saveVersion(workflow: Workflow, description?: string): number {
  return dalSaveVersion(workflow, description);
}

/**
 * List all versions for a workflow (newest first).
 * Returns metadata only (not the full workflow snapshot).
 */
export function listVersions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
): {
  versions: Array<{
    version: number;
    savedAt: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
  }>;
  total: number;
} {
  return dalListVersions(workflowId, opts);
}

/**
 * Get a specific version snapshot.
 */
export function getVersion(workflowId: string, version: number): WorkflowVersion | null {
  return dalGetVersion(workflowId, version);
}

/**
 * Rollback a workflow to a previous version.
 * Returns the restored workflow snapshot (caller is responsible for saving to disk).
 */
export function rollbackToVersion(workflowId: string, version: number): Workflow | null {
  const snapshot = getVersion(workflowId, version);
  if (!snapshot) {
    return null;
  }

  // Return the workflow with updated timestamp
  const restored = structuredClone(snapshot.workflow);
  restored.updatedAt = new Date().toISOString();
  return restored;
}

/**
 * Compare two versions and return a summary of differences.
 */
export function diffVersions(
  workflowId: string,
  versionA: number,
  versionB: number,
): {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  edgesAdded: number;
  edgesRemoved: number;
} | null {
  const a = getVersion(workflowId, versionA);
  const b = getVersion(workflowId, versionB);
  if (!a || !b) {
    return null;
  }

  const nodesA = new Map(a.workflow.nodes.map((n) => [n.id, n]));
  const nodesB = new Map(b.workflow.nodes.map((n) => [n.id, n]));

  const nodesAdded: string[] = [];
  const nodesRemoved: string[] = [];
  const nodesModified: string[] = [];

  for (const [id, node] of nodesB) {
    if (!nodesA.has(id)) {
      nodesAdded.push(node.label);
    } else {
      const nodeA = nodesA.get(id)!;
      if (
        nodeA.label !== node.label ||
        nodeA.subtype !== node.subtype ||
        JSON.stringify(nodeA.config) !== JSON.stringify(node.config)
      ) {
        nodesModified.push(node.label);
      }
    }
  }

  for (const [id, node] of nodesA) {
    if (!nodesB.has(id)) {
      nodesRemoved.push(node.label);
    }
  }

  const edgeIdsA = new Set(a.workflow.edges.map((e) => e.id));
  const edgeIdsB = new Set(b.workflow.edges.map((e) => e.id));

  let edgesAdded = 0;
  let edgesRemoved = 0;
  for (const id of edgeIdsB) {
    if (!edgeIdsA.has(id)) {
      edgesAdded++;
    }
  }
  for (const id of edgeIdsA) {
    if (!edgeIdsB.has(id)) {
      edgesRemoved++;
    }
  }

  return { nodesAdded, nodesRemoved, nodesModified, edgesAdded, edgesRemoved };
}

/**
 * Delete all version history for a workflow.
 */
export function clearVersionHistory(workflowId: string): void {
  dalClearVersionHistory(workflowId);
}
