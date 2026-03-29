/**
 * WorkflowService — main orchestrator for the workflow engine.
 *
 * Lifecycle:
 *   1. start() — loads all enabled workflows, registers triggers
 *   2. Triggers fire → engine executes → history is logged
 *   3. stop() — unregisters all triggers, cleans up
 *
 * The service is a singleton initialized by the gateway on startup.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CronService } from "../cron/service.js";
import {
  activateKillSwitch,
  deactivateKillSwitch,
  checkKillSwitch,
} from "../trading/kill-switch.js";
import { resolveCredential } from "./credentials.js";
import { WorkflowEngine } from "./engine.js";
import {
  saveExecution,
  listExecutions,
  getExecution,
  listAllExecutions,
  clearHistory,
} from "./history.js";
import { TriggerManager } from "./triggers.js";
import type { Workflow, WorkflowExecution, ActionDependencies } from "./types.js";
import { saveVersion } from "./versioning.js";

const WORKFLOWS_DIR = join(homedir(), ".tigerpaw", "workflows");

export class WorkflowService {
  private engine: WorkflowEngine;
  private triggers: TriggerManager;
  private running = false;
  private executionLogs: string[] = [];

  /** Gateway RPC function — set externally after gateway starts. */
  private gatewayRpcFn:
    | ((
        method: string,
        params: Record<string, unknown>,
      ) => Promise<{
        ok: boolean;
        payload?: Record<string, unknown>;
        error?: string;
      }>)
    | null = null;

  constructor() {
    const deps = this.buildDeps();
    this.engine = new WorkflowEngine(deps);
    this.triggers = new TriggerManager((workflow, triggerNode, triggerData) => {
      void this.handleTrigger(workflow, triggerNode.id, triggerData);
    });
  }

  /** Wire the gateway RPC function for action executors to use. */
  setGatewayRpc(
    rpc: (
      method: string,
      params: Record<string, unknown>,
    ) => Promise<{
      ok: boolean;
      payload?: Record<string, unknown>;
      error?: string;
    }>,
  ): void {
    this.gatewayRpcFn = rpc;
  }

  /** Wire the cron service for schedule triggers. */
  setCronService(cron: CronService): void {
    this.triggers.setCronService(cron);
  }

  /**
   * Start the workflow service: load all enabled workflows and register triggers.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    const workflows = this.loadAllWorkflows();
    let registered = 0;

    for (const wf of workflows) {
      if (wf.enabled) {
        await this.triggers.registerWorkflow(wf);
        registered++;
      }
    }

    this.log(
      `Workflow service started: ${registered} active workflow(s), ${this.triggers.registeredCount} trigger(s)`,
    );
  }

  /**
   * Stop the workflow service: unregister all triggers.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    await this.triggers.unregisterAll();
    this.running = false;
    this.log("Workflow service stopped");
  }

  /** Is the service running? */
  get isRunning(): boolean {
    return this.running;
  }

  // ── Public API (called by gateway RPC handlers) ─────────────────

  /**
   * Manually execute a workflow (triggered by user via UI or API).
   */
  async executeManually(
    workflowId: string,
    testData?: Record<string, unknown>,
  ): Promise<WorkflowExecution> {
    const workflow = this.loadWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found`);
    }

    // Find the first trigger node (or any node if testing)
    const triggerNode = workflow.nodes.find((n) => n.type === "trigger");
    const triggerNodeId = triggerNode?.id ?? workflow.nodes[0]?.id;

    if (!triggerNodeId) {
      throw new Error("Workflow has no nodes");
    }

    const execution = await this.engine.execute(workflow, triggerNodeId, {
      triggerType: "manual",
      ...testData,
    });

    saveExecution(execution);
    this.updateWorkflowRunStats(workflowId, execution);

    return execution;
  }

  /**
   * Re-register triggers when a workflow is saved or toggled.
   */
  async onWorkflowChanged(workflowId: string): Promise<void> {
    const workflow = this.loadWorkflow(workflowId);
    if (!workflow) {
      await this.triggers.unregisterWorkflow(workflowId);
      return;
    }
    await this.triggers.registerWorkflow(workflow);
  }

  /**
   * Unregister triggers when a workflow is deleted.
   */
  async onWorkflowDeleted(workflowId: string): Promise<void> {
    await this.triggers.unregisterWorkflow(workflowId);
  }

  /** Get execution history for a workflow. */
  getHistory(workflowId: string, opts?: { limit?: number; offset?: number }) {
    return listExecutions(workflowId, opts);
  }

  /** Get global execution history across all workflows. */
  getGlobalHistory(opts?: { limit?: number; offset?: number }) {
    return listAllExecutions(opts);
  }

  /** Get a specific execution. */
  getExecution(workflowId: string, executionId: string) {
    return getExecution(workflowId, executionId);
  }

  /** Clear history for a workflow. */
  clearWorkflowHistory(workflowId: string) {
    clearHistory(workflowId);
  }

  /** Handle an incoming webhook and fire the matching trigger. */
  handleWebhook(
    path: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): boolean {
    return this.triggers.handleWebhook(path, body, headers);
  }

  /** List registered webhook paths. */
  listWebhooks(): Array<{ workflowId: string; nodeId: string; path: string }> {
    return this.triggers.listWebhooks();
  }

  /** Service diagnostics. */
  diagnostics() {
    return {
      running: this.running,
      registeredTriggers: this.triggers.listRegistered(),
      registeredWebhooks: this.triggers.listWebhooks(),
      recentLogs: this.executionLogs.slice(-20),
    };
  }

  // ── Private ─────────────────────────────────────────────────────

  /** Handle a trigger firing — execute the workflow and log results. */
  private async handleTrigger(
    workflow: Workflow,
    triggerNodeId: string,
    triggerData: Record<string, unknown>,
  ): Promise<void> {
    this.log(`Trigger fired for workflow "${workflow.name}" (${workflow.id})`);

    try {
      const execution = await this.engine.execute(workflow, triggerNodeId, triggerData);
      saveExecution(execution);
      this.updateWorkflowRunStats(workflow.id, execution);

      if (execution.status === "completed") {
        this.log(`Workflow "${workflow.name}" completed in ${execution.durationMs}ms`);
      } else {
        this.log(`Workflow "${workflow.name}" failed: ${execution.error}`);
      }
    } catch (err) {
      this.log(
        `Workflow "${workflow.name}" execution error: ${err instanceof Error ? err.message : String(err as string)}`,
      );
    }
  }

  /**
   * Save a version snapshot when a workflow is saved.
   */
  saveVersionSnapshot(workflowId: string, description?: string): number | null {
    const workflow = this.loadWorkflow(workflowId);
    if (!workflow) {
      return null;
    }
    return saveVersion(workflow, description);
  }

  /** Update lastRunAt and runCount on the workflow JSON file. */
  private updateWorkflowRunStats(workflowId: string, execution: WorkflowExecution): void {
    try {
      const filePath = join(WORKFLOWS_DIR, `${workflowId}.json`);
      if (!existsSync(filePath)) {
        return;
      }

      const workflow = JSON.parse(readFileSync(filePath, "utf-8"));
      workflow.lastRunAt = new Date(execution.startedAt).toISOString();
      workflow.runCount = (workflow.runCount ?? 0) + 1;
      writeFileSync(filePath, JSON.stringify(workflow, null, 2), "utf-8");
    } catch {
      // Non-critical — don't fail the execution
    }
  }

  /** Load a single workflow from disk. */
  private loadWorkflow(id: string): Workflow | null {
    const filePath = join(WORKFLOWS_DIR, `${id}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  /** Load all workflows from disk. */
  private loadAllWorkflows(): Workflow[] {
    if (!existsSync(WORKFLOWS_DIR)) {
      return [];
    }
    return readdirSync(WORKFLOWS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(WORKFLOWS_DIR, f), "utf-8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  /** Build dependencies for the engine's action executors. */
  private buildDeps(): ActionDependencies {
    return {
      gatewayRpc: async (method, params) => {
        if (!this.gatewayRpcFn) {
          return { ok: false, error: "Gateway RPC not available" };
        }
        return this.gatewayRpcFn(method, params);
      },
      killSwitch: {
        activate: (reason, _actor, mode) => activateKillSwitch(reason, "system", mode),
        deactivate: () => deactivateKillSwitch("system"),
        check: async () => {
          const status = await checkKillSwitch();
          return { active: status.active, reason: status.reason };
        },
      },
      log: (msg) => this.log(msg),
      loadWorkflow: (id) => this.loadWorkflow(id),
      resolveCredential: (id) => resolveCredential(id),
    };
  }

  private log(message: string): void {
    const entry = `[${new Date().toISOString()}] ${message}`;
    this.executionLogs.push(entry);
    // Keep max 200 log entries in memory
    if (this.executionLogs.length > 200) {
      this.executionLogs = this.executionLogs.slice(-200);
    }
  }
}

/** Singleton instance. */
let instance: WorkflowService | null = null;

/** Get or create the workflow service singleton. */
export function getWorkflowService(): WorkflowService {
  if (!instance) {
    instance = new WorkflowService();
  }
  return instance;
}

// Re-export types and utilities
export { WorkflowEngine } from "./engine.js";
export { ExecutionContext } from "./context.js";
export { evaluateCondition, supportedConditions } from "./conditions.js";
export { executeAction, supportedActions } from "./actions.js";
export { executeTransform, supportedTransforms } from "./transforms.js";
export { TriggerManager } from "./triggers.js";
export * from "./history.js";
export * from "./types.js";
export * from "./credentials.js";
export {
  saveVersion,
  listVersions,
  getVersion,
  rollbackToVersion,
  diffVersions,
  clearVersionHistory,
} from "./versioning.js";
