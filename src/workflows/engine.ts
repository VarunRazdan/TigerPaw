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
import { evaluateRouter } from "./routers.js";
import { executeTransform } from "./transforms.js";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecution,
  NodeExecutionResult,
  ActionDependencies,
  RetryConfig,
  ExecutionCallbacks,
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

/** Default max loop iterations to prevent infinite loops. */
const DEFAULT_MAX_LOOP_ITERATIONS = 1000;

// ── Merge sync state ────────────────────────────────────────────────

type MergeState = {
  /** IDs of merge nodes in this workflow. */
  mergeNodeIds: Set<string>;
  /** Number of incoming edges per merge node. */
  inDegree: Map<string, number>;
  /** How many branches have arrived at each merge node. */
  arrivalCounts: Map<string, number>;
  /** Collected context snapshots from each arriving branch. */
  branchOutputs: Map<string, Record<string, unknown>[]>;
};

/** Compute merge state for a workflow: identify merge nodes and their inDegree. */
function computeMergeState(nodes: WorkflowNode[], edges: WorkflowEdge[]): MergeState {
  const mergeNodeIds = new Set(
    nodes.filter((n) => n.type === "transform" && n.subtype === "merge").map((n) => n.id),
  );

  const inDegree = new Map<string, number>();
  for (const nodeId of mergeNodeIds) {
    const count = edges.filter((e) => e.target === nodeId).length;
    inDegree.set(nodeId, count);
  }

  return {
    mergeNodeIds,
    inDegree,
    arrivalCounts: new Map(),
    branchOutputs: new Map(),
  };
}

export class WorkflowEngine {
  private deps: ActionDependencies;
  private currentCallbacks?: ExecutionCallbacks;
  private currentPinnedData?: Record<string, Record<string, unknown>>;
  private currentStopAfterNodeId?: string;

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
    callbacks?: ExecutionCallbacks,
    pinnedData?: Record<string, Record<string, unknown>>,
    stopAfterNodeId?: string,
  ): Promise<WorkflowExecution> {
    this.currentCallbacks = callbacks;
    this.currentPinnedData = pinnedData;
    this.currentStopAfterNodeId = stopAfterNodeId;

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

    callbacks?.onExecutionStart?.(execution.id, workflow.id, workflow.name);

    const nodeMap = buildNodeMap(workflow.nodes);
    const adjacency = buildAdjacency(workflow.edges);
    const ctx = new ExecutionContext(triggerData);
    const visited = new Set<string>();
    const mergeState = computeMergeState(workflow.nodes, workflow.edges);

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
      callbacks?.onNodeStart?.(execution.id, triggerNodeId, triggerNode.label, "trigger");
      callbacks?.onNodeComplete?.(execution.id, execution.nodeResults[0]);
      visited.add(triggerNodeId);

      // Store trigger output as items
      if (triggerData) {
        ctx.setNodeOutput(triggerNodeId, [{ json: triggerData, sourceNodeId: triggerNodeId }]);
      }

      // Traverse from trigger node
      await this.traverse(
        triggerNodeId,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        undefined,
        mergeState,
      );

      execution.status = "completed";
    } catch (err) {
      execution.status = "failed";
      execution.error = err instanceof Error ? err.message : String(err as string);
    }

    execution.completedAt = Date.now();
    execution.durationMs = execution.completedAt - execution.startedAt;
    callbacks?.onExecutionComplete?.(execution.id, execution);
    this.currentCallbacks = undefined;
    this.currentPinnedData = undefined;
    this.currentStopAfterNodeId = undefined;
    return execution;
  }

  /**
   * Recursively traverse the graph from a node, executing successors.
   * When a node has multiple outgoing edges, execute branches in parallel.
   *
   * @param filterLabel  When set, only follow edges whose label matches this value.
   *                     Used by router nodes to direct flow to a specific output.
   */
  private async traverse(
    fromNodeId: string,
    nodeMap: Map<string, WorkflowNode>,
    adjacency: Map<string, WorkflowEdge[]>,
    ctx: ExecutionContext,
    execution: WorkflowExecution,
    visited: Set<string>,
    depth: number,
    filterLabel?: string,
    mergeState?: MergeState,
  ): Promise<void> {
    const outEdges = adjacency.get(fromNodeId) ?? [];

    // When a filterLabel is specified, only follow edges with a matching label.
    // Unlabeled edges are also followed when no filterLabel is set.
    const labelFiltered =
      filterLabel != null ? outEdges.filter((e) => e.label === filterLabel) : outEdges;

    // Separate merge node targets from regular targets.
    // Merge nodes use arrival counting instead of simple visited checks.
    const pendingEdges: WorkflowEdge[] = [];

    for (const edge of labelFiltered) {
      if (!nodeMap.has(edge.target)) {
        continue;
      }

      if (mergeState && mergeState.mergeNodeIds.has(edge.target)) {
        // Record arrival at merge node
        const arrivals = (mergeState.arrivalCounts.get(edge.target) ?? 0) + 1;
        mergeState.arrivalCounts.set(edge.target, arrivals);

        // Store a context snapshot from this branch
        const outputs = mergeState.branchOutputs.get(edge.target) ?? [];
        outputs.push(ctx.toJSON());
        mergeState.branchOutputs.set(edge.target, outputs);

        const needed = mergeState.inDegree.get(edge.target) ?? 1;
        if (arrivals >= needed && !visited.has(edge.target)) {
          // All branches have arrived — ready to execute the merge node
          pendingEdges.push(edge);
        }
        // If not all branches arrived yet, this path stops here
      } else if (!visited.has(edge.target)) {
        pendingEdges.push(edge);
      }
    }

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
          mergeState,
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
      mergeState,
    );
  }

  /**
   * Execute a single node and continue traversal from it.
   * Handles error routing, retry logic, disabled passthrough, and router edge selection.
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
    mergeState?: MergeState,
  ): Promise<void> {
    // Disabled node passthrough: skip execution, continue traversal
    if (node.disabled) {
      const skippedResult: NodeExecutionResult = {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: "skipped",
        startedAt: Date.now(),
        completedAt: Date.now(),
        output: { disabled: true },
      };
      execution.nodeResults.push(skippedResult);
      this.currentCallbacks?.onNodeComplete?.(execution.id, skippedResult);
      await this.traverse(
        node.id,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        undefined,
        mergeState,
      );
      return;
    }

    // Pinned data: skip execution and use frozen output
    if (this.currentPinnedData?.[node.id]) {
      const pinnedOutput = this.currentPinnedData[node.id];
      const pinnedResult: NodeExecutionResult = {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: "success",
        startedAt: Date.now(),
        completedAt: Date.now(),
        output: pinnedOutput,
        pinned: true,
      };
      execution.nodeResults.push(pinnedResult);
      this.currentCallbacks?.onNodeComplete?.(execution.id, pinnedResult);
      if (pinnedOutput) {
        ctx.merge(pinnedOutput);
        ctx.setNodeOutput(node.id, [{ json: pinnedOutput, sourceNodeId: node.id }]);
      }
      await this.traverse(
        node.id,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        undefined,
        mergeState,
      );
      return;
    }

    // Inject credential into context if configured
    if (node.credentialId && this.deps.resolveCredential) {
      const creds = this.deps.resolveCredential(node.credentialId);
      if (creds) {
        ctx.merge({ credentials: creds });
      }
    }

    // Inject collected branch outputs for merge nodes
    if (node.type === "transform" && node.subtype === "merge" && mergeState) {
      const branchOutputs = mergeState.branchOutputs.get(node.id) ?? [];
      ctx.set("__branchOutputs", branchOutputs);
    }

    // Capture context snapshot before execution (for input inspection)
    const inputSnapshot = ctx.toJSON();

    this.currentCallbacks?.onNodeStart?.(execution.id, node.id, node.label, node.type);
    const result = await this.executeWithRetry(node, edge, ctx, depth);
    result.input = inputSnapshot;
    execution.nodeResults.push(result);
    this.currentCallbacks?.onNodeComplete?.(execution.id, result);

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
          await this.traverse(
            errorHandler.id,
            nodeMap,
            adjacency,
            ctx,
            execution,
            visited,
            depth,
            undefined,
            mergeState,
          );
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
              mergeState,
            );
          }
        }
        return;
      }

      // No error handler — fail-fast
      throw new Error(`Node "${node.label}" failed: ${result.error}`);
    }

    // Merge output into context for downstream nodes
    if (result.output) {
      ctx.merge(result.output);
    }

    // Stop-after: halt traversal after target node executes
    if (this.currentStopAfterNodeId && node.id === this.currentStopAfterNodeId) {
      return;
    }

    // Loop nodes: iterate over an array, executing the loop body per item
    if (node.type === "router" && node.subtype === "loop") {
      await this.executeLoop(node, nodeMap, adjacency, ctx, execution, visited, depth, mergeState);
      return;
    }

    // Router nodes: use selectedOutput to filter which edges to follow
    if (node.type === "router" && result.output?.selectedOutput) {
      const selectedLabel = result.output.selectedOutput as string;
      await this.traverse(
        node.id,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        selectedLabel,
        mergeState,
      );
      return;
    }

    // Condition nodes: route based on conditionResult
    if (node.type === "condition") {
      const matched = result.output?.conditionResult === true;
      const label = matched ? "match" : "no-match";
      await this.traverse(
        node.id,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        label,
        mergeState,
      );
      return;
    }

    if (result.status === "skipped") {
      // Non-condition skipped nodes — don't traverse further
      return;
    }

    // Continue traversal to successors (no label filter)
    await this.traverse(
      node.id,
      nodeMap,
      adjacency,
      ctx,
      execution,
      visited,
      depth,
      undefined,
      mergeState,
    );
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
          const condOutput = { conditionResult: matched };
          ctx.setNodeOutput(node.id, [{ json: condOutput, sourceNodeId: node.id }]);

          // Conditions always succeed — the engine uses conditionResult
          // to decide which edge label ("match" / "no-match") to follow.
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "condition",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: condOutput,
          };
        }

        case "router": {
          const routerResult = evaluateRouter(node.subtype, node.config, ctx);
          const routerOutput = {
            selectedOutput: routerResult.selectedOutput,
            evaluatedValue: routerResult.evaluatedValue,
          };
          ctx.setNodeOutput(node.id, [{ json: routerOutput, sourceNodeId: node.id }]);
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "router",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: routerOutput,
          };
        }

        case "action": {
          // Special handling for run_workflow (sub-workflow)
          if (node.subtype === "run_workflow") {
            return this.executeSubWorkflow(node, ctx, startedAt, depth);
          }

          const items = await executeAction(node.subtype, node.config, ctx, this.deps);
          ctx.setNodeOutput(node.id, items);
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "action",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: items[0]?.json,
          };
        }

        case "transform": {
          const items = executeTransform(node.subtype, node.config, ctx);
          ctx.setNodeOutput(node.id, items);
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "transform",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: items[0]?.json,
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

          const ehOutput = { errorHandled: true, errorAction, originalError: errorInfo };
          ctx.setNodeOutput(node.id, [
            { json: ehOutput as Record<string, unknown>, sourceNodeId: node.id },
          ]);
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "error_handler",
            status: "success",
            startedAt,
            completedAt: Date.now(),
            output: ehOutput,
          };
        }

        case "annotation":
          // Annotations are visual-only — engine ignores them
          return {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: "annotation",
            status: "skipped",
            startedAt,
            completedAt: Date.now(),
          };

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
   * Execute a loop node: iterate over an array, running the loop body per item.
   *
   * Loop edges (label "loop") form the loop body. After all iterations,
   * traversal continues via "done" edges.
   */
  private async executeLoop(
    node: WorkflowNode,
    nodeMap: Map<string, WorkflowNode>,
    adjacency: Map<string, WorkflowEdge[]>,
    ctx: ExecutionContext,
    execution: WorkflowExecution,
    visited: Set<string>,
    depth: number,
    mergeState?: MergeState,
  ): Promise<void> {
    const arrayPath = (node.config.arrayPath as string | undefined) ?? "";
    const itemVariable = (node.config.itemVariable as string | undefined) ?? "item";
    const indexVariable = (node.config.indexVariable as string | undefined) ?? "index";
    const maxIterations =
      (node.config.maxIterations as number | undefined) ?? DEFAULT_MAX_LOOP_ITERATIONS;

    // Resolve the array from context
    const rawArray = arrayPath.startsWith("$")
      ? ctx.getPath(arrayPath.slice(1))
      : ctx.get(arrayPath);

    const items = Array.isArray(rawArray) ? rawArray : [];
    const iterationCount = Math.min(items.length, maxIterations);

    // Empty array — skip directly to "done" edges
    if (iterationCount === 0) {
      ctx.set("loopResults", []);
      ctx.set("loopCount", 0);
      await this.traverse(
        node.id,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        "done",
        mergeState,
      );
      return;
    }

    // Snapshot visited state before loop iterations
    const beforeVisited = new Set(visited);
    const loopResults: unknown[] = [];

    for (let i = 0; i < iterationCount; i++) {
      // Inject loop variables
      ctx.set(itemVariable, items[i]);
      ctx.set(indexVariable, i);
      ctx.set("loopTotal", items.length);

      // Between iterations, clear nodes added during the previous iteration
      // so loop body nodes can re-execute
      if (i > 0) {
        for (const id of visited) {
          if (!beforeVisited.has(id)) {
            visited.delete(id);
          }
        }
      }

      // Traverse "loop" edges (the loop body)
      await this.traverse(
        node.id,
        nodeMap,
        adjacency,
        ctx,
        execution,
        visited,
        depth,
        "loop",
        mergeState,
      );

      // Collect context state after this iteration
      loopResults.push(ctx.toJSON());
    }

    // Set aggregated results
    ctx.set("loopResults", loopResults);
    ctx.set("loopCount", iterationCount);

    // Continue to "done" edges
    await this.traverse(
      node.id,
      nodeMap,
      adjacency,
      ctx,
      execution,
      visited,
      depth,
      "done",
      mergeState,
    );
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
      this.currentCallbacks,
      this.currentPinnedData,
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
