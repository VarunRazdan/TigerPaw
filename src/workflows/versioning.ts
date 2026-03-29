/**
 * Workflow Version History — snapshot management.
 *
 * Each time a workflow is saved, a version snapshot is stored in
 * ~/.tigerpaw/workflow-versions/{workflowId}/. Supports listing,
 * rollback, diff metadata, and configurable retention.
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
import type { Workflow, WorkflowVersion } from "./types.js";

const VERSIONS_DIR = join(homedir(), ".tigerpaw", "workflow-versions");
const MAX_VERSIONS_PER_WORKFLOW = 50;

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function workflowVersionsDir(workflowId: string): string {
  return join(VERSIONS_DIR, workflowId);
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Save a version snapshot of a workflow.
 * Returns the version number assigned.
 */
export function saveVersion(workflow: Workflow, description?: string): number {
  const dir = workflowVersionsDir(workflow.id);
  ensureDir(dir);

  // Determine next version number
  const existing = listVersionNumbers(dir);
  const nextVersion = existing.length > 0 ? Math.max(...existing) + 1 : 1;

  const snapshot: WorkflowVersion = {
    version: nextVersion,
    workflow: structuredClone(workflow),
    savedAt: new Date().toISOString(),
    description,
  };

  writeFileSync(join(dir, `v${nextVersion}.json`), JSON.stringify(snapshot, null, 2), "utf-8");

  // Prune old versions
  pruneVersions(dir, MAX_VERSIONS_PER_WORKFLOW);

  return nextVersion;
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
  const dir = workflowVersionsDir(workflowId);
  if (!existsSync(dir)) {
    return { versions: [], total: 0 };
  }

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("v") && f.endsWith(".json"))
    .map((f) => {
      const stat = statSync(join(dir, f));
      return { name: f, mtime: stat.mtimeMs };
    })
    .toSorted((a, b) => b.mtime - a.mtime); // newest first

  const total = files.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const slice = files.slice(offset, offset + limit);

  const versions = slice
    .map((file) => {
      try {
        const raw: WorkflowVersion = JSON.parse(readFileSync(join(dir, file.name), "utf-8"));
        return {
          version: raw.version,
          savedAt: raw.savedAt,
          description: raw.description,
          nodeCount: raw.workflow.nodes?.length ?? 0,
          edgeCount: raw.workflow.edges?.length ?? 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{
    version: number;
    savedAt: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
  }>;

  return { versions, total };
}

/**
 * Get a specific version snapshot.
 */
export function getVersion(workflowId: string, version: number): WorkflowVersion | null {
  const filePath = join(workflowVersionsDir(workflowId), `v${version}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
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

  // Nodes in B but not in A → added
  for (const [id, node] of nodesB) {
    if (!nodesA.has(id)) {
      nodesAdded.push(node.label);
    } else {
      // Check if modified
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

  // Nodes in A but not in B → removed
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
  const dir = workflowVersionsDir(workflowId);
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

// ── Private helpers ───────────────────────────────────────────────

function listVersionNumbers(dir: string): number[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.startsWith("v") && f.endsWith(".json"))
    .map((f) => parseInt(f.slice(1, -5), 10))
    .filter((n) => !isNaN(n));
}

function pruneVersions(dir: string, maxVersions: number): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("v") && f.endsWith(".json"))
    .map((f) => {
      const stat = statSync(join(dir, f));
      return { name: f, mtime: stat.mtimeMs };
    })
    .toSorted((a, b) => a.mtime - b.mtime); // oldest first

  const excess = files.length - maxVersions;
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
