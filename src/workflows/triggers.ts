/**
 * Trigger Manager — listens for events and fires workflow executions.
 *
 * Manages the lifecycle of triggers for enabled workflows:
 * - Cron triggers → register cron jobs
 * - Trading event triggers → subscribe to event emitter
 * - Message received triggers → subscribe via hook
 * - Manual triggers → called directly via RPC
 * - Webhook triggers → register HTTP routes (deferred)
 *
 * When a trigger fires, it calls the provided `onTrigger` callback,
 * which the WorkflowService wires to the engine.
 */

import type { CronService } from "../cron/service.js";
import { onTradingEvent } from "../trading/event-emitter.js";
import type { TradingEvent } from "../trading/events.js";
import type { Workflow, WorkflowNode } from "./types.js";

export type TriggerCallback = (
  workflow: Workflow,
  triggerNode: WorkflowNode,
  triggerData: Record<string, unknown>,
) => void;

type RegisteredTrigger = {
  workflowId: string;
  nodeId: string;
  type: string;
  cleanup: () => void;
};

export class TriggerManager {
  private triggers: RegisteredTrigger[] = [];
  private cronService: CronService | null = null;
  private onTrigger: TriggerCallback;

  constructor(onTrigger: TriggerCallback) {
    this.onTrigger = onTrigger;
  }

  /** Set the cron service reference (available after gateway starts). */
  setCronService(cron: CronService): void {
    this.cronService = cron;
  }

  /**
   * Register all triggers for a workflow's trigger nodes.
   * Call this when a workflow is enabled or on startup for enabled workflows.
   */
  async registerWorkflow(workflow: Workflow): Promise<void> {
    // First unregister any existing triggers for this workflow
    await this.unregisterWorkflow(workflow.id);

    if (!workflow.enabled) {
      return;
    }

    const triggerNodes = workflow.nodes.filter((n) => n.type === "trigger");

    for (const node of triggerNodes) {
      const trigger = await this.registerNode(workflow, node);
      if (trigger) {
        this.triggers.push(trigger);
      }
    }
  }

  /**
   * Unregister all triggers for a workflow.
   * Call this when a workflow is disabled or deleted.
   */
  async unregisterWorkflow(workflowId: string): Promise<void> {
    const toRemove = this.triggers.filter((t) => t.workflowId === workflowId);
    for (const trigger of toRemove) {
      trigger.cleanup();
    }
    this.triggers = this.triggers.filter((t) => t.workflowId !== workflowId);
  }

  /** Unregister all triggers (shutdown). */
  async unregisterAll(): Promise<void> {
    for (const trigger of this.triggers) {
      trigger.cleanup();
    }
    this.triggers = [];
  }

  /** Get registered trigger count (for diagnostics). */
  get registeredCount(): number {
    return this.triggers.length;
  }

  /** List registered triggers (for diagnostics). */
  listRegistered(): Array<{ workflowId: string; nodeId: string; type: string }> {
    return this.triggers.map((t) => ({
      workflowId: t.workflowId,
      nodeId: t.nodeId,
      type: t.type,
    }));
  }

  // ── Private: register a single trigger node ─────────────────────

  private async registerNode(
    workflow: Workflow,
    node: WorkflowNode,
  ): Promise<RegisteredTrigger | null> {
    switch (node.subtype) {
      case "cron":
        return this.registerCron(workflow, node);
      case "trading.event":
        return this.registerTradingEvent(workflow, node);
      case "message.received":
        return this.registerMessageReceived(workflow, node);
      case "webhook":
        // Webhook triggers require HTTP route registration — deferred
        return null;
      case "manual":
        // Manual triggers are fired on-demand, no registration needed
        return null;
      default:
        return null;
    }
  }

  // ── Cron trigger ────────────────────────────────────────────────

  private async registerCron(
    workflow: Workflow,
    node: WorkflowNode,
  ): Promise<RegisteredTrigger | null> {
    if (!this.cronService) {
      return null;
    }

    const expression = (node.config.expression as string | undefined) ?? "";
    const timezone = node.config.timezone as string | undefined;
    if (!expression) {
      return null;
    }

    const jobName = `workflow-${workflow.id}-${node.id}`;

    try {
      // Remove any existing job with this name
      const existingJob = this.cronService.getJob(jobName);
      if (existingJob) {
        await this.cronService.remove(existingJob.id);
      }

      // Create a cron job using the systemEvent payload type.
      // The cron service's run hook will match this job by name prefix
      // and invoke the workflow trigger callback.
      const job = await this.cronService.add({
        name: jobName,
        description: `Workflow trigger: ${workflow.name}`,
        schedule: { kind: "cron", expr: expression, tz: timezone },
        enabled: true,
        payload: { kind: "systemEvent" as const, text: `workflow:${workflow.id}:${node.id}` },
        sessionTarget: "isolated" as const,
        wakeMode: "next-heartbeat" as const,
      });

      // Poll for cron completion by checking job state periodically.
      // A more robust approach would hook into the cron service's run lifecycle,
      // but for now we use an interval that checks if lastRunAtMs advanced.
      let lastSeenRunAt = job.state.lastRunAtMs ?? 0;
      const pollInterval = setInterval(() => {
        const current = this.cronService?.getJob(job.id);
        if (!current) {
          clearInterval(pollInterval);
          return;
        }
        const currentRunAt = current.state.lastRunAtMs ?? 0;
        if (currentRunAt > lastSeenRunAt) {
          lastSeenRunAt = currentRunAt;
          this.onTrigger(workflow, node, {
            triggerType: "cron",
            expression,
            firedAt: new Date(currentRunAt).toISOString(),
          });
        }
      }, 5_000); // Check every 5 seconds

      return {
        workflowId: workflow.id,
        nodeId: node.id,
        type: "cron",
        cleanup: () => {
          clearInterval(pollInterval);
          if (this.cronService) {
            const j = this.cronService.getJob(jobName);
            if (j) {
              void this.cronService.remove(j.id).catch(() => {});
            }
          }
        },
      };
    } catch {
      return null;
    }
  }

  // ── Trading event trigger ───────────────────────────────────────

  private registerTradingEvent(workflow: Workflow, node: WorkflowNode): RegisteredTrigger | null {
    const eventType = (node.config.event ?? node.config.eventType ?? "") as string;

    const unsubscribe = onTradingEvent((event: TradingEvent) => {
      // If a specific event type is configured, filter; otherwise match all trading events
      if (eventType && event.type !== eventType) {
        return;
      }

      this.onTrigger(workflow, node, {
        triggerType: "trading.event",
        event: event.type,
        ...event.payload,
        timestamp: event.timestamp,
      });
    });

    return {
      workflowId: workflow.id,
      nodeId: node.id,
      type: "trading.event",
      cleanup: unsubscribe,
    };
  }

  // ── Message received trigger ────────────────────────────────────

  private registerMessageReceived(
    workflow: Workflow,
    node: WorkflowNode,
  ): RegisteredTrigger | null {
    const filterChannel = node.config.channel as string | undefined;
    const filterSender = node.config.sender as string | undefined;

    // Subscribe to trading events that carry message data
    // In a full implementation, this would hook into the messaging plugin system.
    // For now, we use the gateway broadcast pattern — messages arrive as events.
    const unsubscribe = onTradingEvent((event: TradingEvent) => {
      // Messages aren't trading events by default, but the system
      // can be extended to emit message events. For now, this is a placeholder
      // that fires on any event matching "message.*" if we add those later.
      if (!event.type.startsWith("message.")) {
        return;
      }

      const channel = event.payload.extensionId ?? "";
      const sender = event.payload.symbol ?? "";

      if (filterChannel && channel !== filterChannel) {
        return;
      }
      if (filterSender && !sender.includes(filterSender)) {
        return;
      }

      this.onTrigger(workflow, node, {
        triggerType: "message.received",
        channel,
        sender,
        ...event.payload,
      });
    });

    return {
      workflowId: workflow.id,
      nodeId: node.id,
      type: "message.received",
      cleanup: unsubscribe,
    };
  }
}
