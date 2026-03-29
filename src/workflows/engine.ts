/**
 * Workflow Execution Engine.
 *
 * Traverses the workflow graph (DAG) starting from a trigger node,
 * evaluating conditions, executing actions, and processing transforms.
 * Data flows between nodes via the ExecutionContext.
 *
 * Graph traversal:
 *   1. Start at the trigger node
 *   2. Follow outgoing edges to successor nodes
 *   3. For conditions: evaluate and follow "match" or "no-match" edges
 *   4. For actions/transforms: execute, merge output into context, follow all edges
 *   5. Parallel branches: when a node has multiple outgoing edges, execute concurrently
 *   6. Error handlers: on failure, route to error_handler nodes instead of fail-fast
 *   7. Retry/backoff: action/transform nodes may specify retry policy
 *   8. Continue until all reachable leaf nodes are processed
 */

import { executeAction } from "./actions.js";
import { evaluateCondition } from "./conditions.js";
import { ExecutionContext } from "./context.js";
import { executeTransform } from "./transforms.js";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecution,
  NodeExecutionResult,
  ActionDependencies,
  RetryConfig,
} from "./types.js";

/** Generate a short unique ID for execution runs. */
function execId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${rand}`;
}

/** Build an adjacency list: nodeId → outgoing edges. */
function buildAdjacency(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const adj = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge);
    adj.set(edge.source, list);
  }
  return adj;
}

/** Build a node lookup: nodeId → WorkflowNode. */
function buildNodeMap(nodes: WorkflowNode[]): Map<string, WorkflowNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Compute delay for a retry attempt based on backoff strategy. */
function computeRetryDelay(config: RetryConfig, attempt: number): number {
  switch (config.backoff) {
    case "none":
      return config.delayMs;
    case "linear":
      return Math.min(config.delayMs * (attempt + 1), config.maxDelayMs);
    case "exponential":
      return Math.min(config.delayMs * Math.pow(2, attempt), config.maxDelayMs);
    default:
      return config.delayMs;
  }
}

/** Sleep helper for retry delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Max depth for sub-workflow recursion. */
const MAX_SUB_WORKFLOW_DEPTH = 10;

export class WorkflowEngine {
  private deps: ActionDependencies;

  constructor(deps: ActionDependencies) {
    this.deps = deps;
  }

  /**
   * Execute a workflow starting from a specific trigger node.
   *
   * @param workflow     The workflow definition
   * @param triggerNodeId  The trigger node that fired
   * @param triggerData    Data from the trigger event (seeded into context)
   * @param parentExecutionId  If this is a sub-workflow, the parent execution ID
   * @param depth          Recursion depth guard for sub-workflows
   * @returns Execution result with per-node details
   */
  async execute(
    workflow: Workflow,
    triggerNodeId: string,
    triggerData?: Record<string, unknown>,
    parentExecutionId?: string,
    depth: number = 0,
  ): Promise<WorkflowExecution> {
    if (depth > MAX_SUB_WORKFLOW_DEPTH) {
      return {
        id: execId(),
        workflowId: workflow.id,
        workflowName: workflow.name,
        triggeredBy: triggerNodeId,
        triggerData,
        status: "failed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        nodeResults: [],
        error: `Sub-workflow recursion limit exceeded (max depth: ${MAX_SUB_WORKFLOW_DEPTH})`,
        parentExecutionId,
      };
    }

    const execution: WorkflowExecution = {
      id: execId(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      triggeredBy: triggerNodeId,
      triggerData,
      status: "running",
      startedAt: Date.now(),
      nodeResults: [],
      parentExecutionId,
    };

    const nodeMap = buildNodeMap(workflow.nodes);
    const adjacency = buildAdjacency(workflow.edges);
    const ctx = new ExecutionContext(triggerData);
    const visited = new Set<string>();

    try {
      // Verify trigger node exists
      const triggerNode = nodeMap.get(triggerNodeId);
      if (!triggerNode) {
        throw new Error(`Trigger node "${triggerNodeId}" not found in workflow`);
      }

      // Record trigger node as executed
      execution.nodeResults.push({
        nodeId: triggerNodeId,
        nodeLabel: triggerNode.label,
        nodeType: "trigger",
        status: "success",
        startedAt: execution.startedAt,
        completedAt: Date.now(),
        output: triggerData,
      });
      visited.add(triggerNodeId);

      // Traverse from trigger node
      await this.traverse(triggerNodeId, nodeMap, adjacency, ctx, execution, visited, depth);

      execution.status = "completed";
    } catch (err) {
      execution.status = "failed";
      execution.error = err instanceof Error ? err.message : String(err as string);
    }

    execution.completedAt = Date.now();
    execution.durationMs = execution.completedAt - execution.startedAt;
    return execution;
  }

  /**
   * Recursively traverse the graph from a node, executing successors.
   * When a node has multiple outgoing edges, execute branches in parallel.
   */
  private async traverse(
    fromNodeId: string,
    nodeMap: Map<string, WorkflowNode>,
    adjacency: Map<string, WorkflowEdge[]>,
    ctx: ExecutionContext,
    execution: WorkflowExecution,
    visited: Set<string>,
    depth: number,
  ): Promise<void> {
    const outEdges = adjacency.get(fromNodeId) ?? [];

    // Filter to edges whose target hasn't been visited yet
    const pendingEdges = outEdges.filter((e) => !visited.has(e.target) && nodeMap.has(e.target));

    if (pendingEdges.length === 0) {
      return;
    }

    // Mark all targets as visited upfront to prevent other branches from re-entering
    for (const edge of pendingEdges) {
      visited.add(edge.target);
    }

    // Parallel execution: run all branches concurrently
    if (pendingEdges.length > 1) {
      const branchPromises = pendingEdges.map(async (edge) => {
        const targetNode = nodeMap.get(edge.target)!;
        await this.executeAndContinue(
          targetNode,
          edge,
          nodeMap,
          adjacency,
          ctx,
          execution,
          visited,
          depth,
        );
      });

      // Wait for all branches — collect errors but don't fail-fast
      const results = await Promise.allSettled(branchPromises);

      // If any branch threw an unhandled error, propagate the first one
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (firstError) {
        throw firstError.reason;
      }

      return;
    }

    // Single edge: sequential execution
    const edge = pendingEdges[0];
    const targetNode = nodeMap.get(edge.target)!;
    await this.executeAndContinue(
      targetNode,
      edge,
      nodeMap,
      adjacency,
      ctx,
      execution,
      visited,
      depth,
    );
  }

  /**
   * Execute a single node and continue traversal from it.
   * Handles error routing and retry logic.
   */
  private async executeAndContinue(
    node: WorkflowNode,
    edge: WorkflowEdge,
    nodeMap: Map<string, WorkflowNode>,
    adjacency: Map<string, WorkflowEdge[]>,
    ctx: ExecutionContext,
    execution: WorkflowExecution,
    visited: Set<string>,
    depth: number,
  ): Promise<void> {
    // Inject credential into context if configured
    if (node.credentialId && this.deps.resolveCredential) {
      const creds = this.deps.resolveCredential(node.credentialId);
      if (creds) {
        ctx.merge({ credentials: creds });
      }
    }

    const result = await this.executeWithRetry(node, edge, ctx, depth);
    execution.nodeResults.push(result);

    if (result.status === "error") {
      // Check for error handler node
      if (node.errorHandlerId) {
        const errorHandler = nodeMap.get(node.errorHandlerId);
        if (errorHandler && !visited.has(errorHandler.id)) {
          visited.add(errorHandler.id);
          // Inject error info into context for the error handler
          ctx.merge({
            error: {
              nodeId: node.id,
              nodeLabel: node.label,
              message: result.error,
              retryCount: result.retryCount ?? 0,
            },
          });

          const handlerResult = await this.executeNode(errorHandler, edge, ctx, depth);
          execution.nodeResults.push(handlerResult);

          if (handlerResult.status === "success" && handlerResult.output) {
            ctx.merge(handlerResult.output);
          }

          // Continue from error handler
          await this.traverse(errorHandler.id, nodeMap, adjacency, ctx, execution, visited, depth);
          return;
        }
      }

      // Also check for outgoing "error" edges from the failed node
      const errorEdges = (adjacency.get(node.id) ?? []).filter(
        (e) => e.label === "error" && !visited.has(e.target),
      );
      if (errorEdges.length > 0) {
        ctx.merge({
          error: {
            nodeId: node.id,
            nodeLabel: node.label,
            message: result.error,
            retryCount: result.retryCount ?? 0,
          },
        });
        for (const errEdge of errorEdges) {
          const errTarget = nodeMap.get(errEdge.target);
          if (errTarget) {
            visited.add(errTarget.id);
            await this.executeAndContinue(
              errTarget,
              errEdge,
              nodeMap,
              adjacency,
              ctx,
              execution,
              visited,
              depth,
            );
          }
        }
        return;
      }

      // No error handler — fail-fast
      throw new Error(`Node "${node.label}" failed: ${result.error}`);
    }

    if (result.status === "skipped") {
      // Condition didn't match — don't traverse further from this path
      return;
    }

    // Merge output into context for downstream nodes
    if (result.output) {
      ctx.merge(result.output);
    }

    // Continue traversal to successors
    await this.traverse(node.id, nodeMap, adjacency, ctx, execution, visited, depth);
  }

  /**
   * Execute a node with retry logic based on its retryConfig.
   */
  private async executeWithRetry(
    node: WorkflowNode,
    edge: WorkflowEdge,
    ctx: ExecutionContext,
    depth: number,
  ): Promise<NodeExecutionResult> {
    const retry = node.retryConfig;

    // No retry configured — execute once
    if (!retry || retry.maxRetries <= 0) {
      return this.executeNode(node, edge, ctx, depth);
    }

    let lastResult: NodeExecutionResult | null = null;

    for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
      lastResult = await this.executeNode(node, edge, ctx, depth);

      if (lastResult.status !== "error") {
        lastResult.retryCount = attempt;
        return lastResult;
      }

      // If this wasn't the last attempt, wait and retry
      if (attempt < retry.maxRetries) {
        const delay = computeRetryDelay(retry, attempt);
        this.deps.log(
          `Retrying node "${node.label}" (attempt ${attempt + 1}/${retry.maxRetries}) after ${delay}ms`,
        );
        await sleep(delay);
      }
    }

    // All retries exhausted
    lastResult!.retryCount = retry.maxRetries;
    return lastResult!;
  }

  /**
   * Execute a single node based on its type.
   */
  private async executeNode(
    node: WorkflowNode,
    incomingEdge: WorkflowEdge,
    ctx: ExecutionContext,
    depth: number,
  ): Promise<NodeExecutionResult> {
    const startedAt = Date.now();

    try {
      switch (node.type) {
        case "condition": {
          const matched = evaluateCondition(node.subtype, node.config, ctx);

          if (!matched) {
            return {
              nodeId: node.id,
              nodeLabel: node.label,
              nodeType: "condition",
              status: "skipped",
              startedAt,
              completedAt: Date.now(),
              output: { conditionResult: false },
            };
          }

          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "condition",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: { conditionResult: true },
          };
        }

        case "action": {
          // Special handling for run_workflow (sub-workflow)
          if (node.subtype === "run_workflow") {
            return this.executeSubWorkflow(node, ctx, startedAt, depth);
          }

          const output = await executeAction(node.subtype, node.config, ctx, this.deps);
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "action",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output,
          };
        }

        case "transform": {
          const output = executeTransform(node.subtype, node.config, ctx);
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "transform",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output,
          };
        }

        case "error_handler": {
          // Error handler nodes: execute their configured action (e.g. log, notify, or custom)
          const errorAction = (node.config.action as string | undefined) ?? "log";
          const errorInfo = ctx.get("error") as Record<string, unknown> | undefined;

          if (errorAction === "log") {
            this.deps.log(
              `[Error Handler] ${node.label}: ${(errorInfo?.message as string) ?? "unknown error"} (from node: ${(errorInfo?.nodeLabel as string) ?? "unknown"})`,
            );
          } else if (errorAction === "notify") {
            const template =
              (node.config.template as string | undefined) ??
              "Error in {{error.nodeLabel}}: {{error.message}}";
            const message = ctx.resolveTemplate(template);
            await executeAction("send_message", { ...node.config, message }, ctx, this.deps);
          } else if (errorAction === "retry_from") {
            // The upstream should handle re-routing; just pass through
          }

          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "error_handler",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: { errorHandled: true, errorAction, originalError: errorInfo },
          };
        }

        case "trigger":
          // Additional triggers in the graph are no-ops (only the first trigger fires)
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "trigger",
            status: "skipped",
            startedAt,
            completedAt: Date.now(),
          };

        default:
          throw new Error(`Unknown node type: ${node.type as string}`);
      }
    } catch (err) {
      return {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: "error",
        startedAt,
        completedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err as string),
      };
    }
  }

  /**
   * Execute a sub-workflow by loading and running another workflow.
   */
  private async executeSubWorkflow(
    node: WorkflowNode,
    ctx: ExecutionContext,
    startedAt: number,
    parentDepth: number,
  ): Promise<NodeExecutionResult> {
    const targetWorkflowId = (node.config.workflowId as string | undefined) ?? "";
    if (!targetWorkflowId) {
      return {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: "action",
        status: "error",
        startedAt,
        completedAt: Date.now(),
        error: "run_workflow: workflowId is required",
      };
    }

    if (!this.deps.loadWorkflow) {
      return {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: "action",
        status: "error",
        startedAt,
        completedAt: Date.now(),
        error: "run_workflow: workflow loader not available",
      };
    }

    const subWorkflow = this.deps.loadWorkflow(targetWorkflowId);
    if (!subWorkflow) {
      return {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: "action",
        status: "error",
        startedAt,
        completedAt: Date.now(),
        error: `run_workflow: workflow "${targetWorkflowId}" not found`,
      };
    }

    // Build input data: merge current context with explicit input mapping
    const inputMapping = (node.config.inputMapping ?? {}) as Record<string, string>;
    const inputData: Record<string, unknown> = {};
    for (const [targetKey, sourceKey] of Object.entries(inputMapping)) {
      inputData[targetKey] = sourceKey.startsWith("$")
        ? ctx.getPath(sourceKey.slice(1))
        : (ctx.get(sourceKey) ?? sourceKey);
    }

    // If no explicit mapping, pass the full context
    const triggerData = Object.keys(inputData).length > 0 ? inputData : ctx.toJSON();

    const triggerNode = subWorkflow.nodes.find((n) => n.type === "trigger");
    const triggerNodeId = triggerNode?.id ?? subWorkflow.nodes[0]?.id;

    if (!triggerNodeId) {
      return {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: "action",
        status: "error",
        startedAt,
        completedAt: Date.now(),
        error: "run_workflow: target workflow has no nodes",
      };
    }

    this.deps.log(`Executing sub-workflow "${subWorkflow.name}" (depth: ${parentDepth + 1})`);

    const subExecution = await this.execute(
      subWorkflow,
      triggerNodeId,
      triggerData,
      undefined,
      parentDepth + 1,
    );

    if (subExecution.status === "failed") {
      return {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: "action",
        status: "error",
        startedAt,
        completedAt: Date.now(),
        error: `Sub-workflow "${subWorkflow.name}" failed: ${subExecution.error}`,
      };
    }

    // Extract output from the last successful node
    const lastSuccess = [...subExecution.nodeResults]
      .toReversed()
      .find((r) => r.status === "success" && r.output);

    return {
      nodeId: node.id,
      nodeLabel: node.label,
      nodeType: "action",
      status: "success",
      startedAt,
      completedAt: Date.now(),
      output: {
        subWorkflowId: subWorkflow.id,
        subWorkflowName: subWorkflow.name,
        subExecutionId: subExecution.id,
        subStatus: subExecution.status,
        subDurationMs: subExecution.durationMs,
        ...lastSuccess?.output,
      },
    };
  }
}
