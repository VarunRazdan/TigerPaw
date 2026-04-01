/**
 * Workflow execution types.
 *
 * These types define the runtime shape of workflow nodes and execution results.
 * The workflow graph is stored as nodes + edges (same as the UI/store model);
 * these types add execution semantics on top.
 */

// ── Node config shapes (per subtype) ──────────────────────────────

export type TriggerSubtype =
  | "cron"
  | "trading.event"
  | "message.received"
  | "webhook"
  | "manual"
  | (string & {});
export type ConditionSubtype =
  | "contains_keyword"
  | "sender_matches"
  | "channel_is"
  | "time_of_day"
  | "expression";
export type ActionSubtype =
  | "send_message"
  | "call_webhook"
  | "run_llm_task"
  | "killswitch"
  | "trade"
  | "run_workflow"
  | "send_email"
  | "create_calendar_event"
  | "schedule_meeting"
  | (string & {});
export type TransformSubtype = "extract_data" | "format_text" | "parse_json" | "merge";
export type RouterSubtype = "if_else" | "switch" | "loop";

export type WorkflowNodeType =
  | "trigger"
  | "condition"
  | "action"
  | "transform"
  | "error_handler"
  | "router"
  | "annotation";

// ── Retry / backoff configuration ─────────────────────────────────

export type BackoffStrategy = "none" | "linear" | "exponential";

export type RetryConfig = {
  maxRetries: number;
  backoff: BackoffStrategy;
  delayMs: number;
  maxDelayMs: number;
};

// ── Persisted workflow model (mirrors ui store) ───────────────────

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  subtype: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  /** Optional retry configuration for action/transform nodes. */
  retryConfig?: RetryConfig;
  /** Node ID of an error handler to route to on failure (instead of fail-fast). */
  errorHandlerId?: string;
  /** Credential ID to inject into context before execution. */
  credentialId?: string;
  /** Named output handles for router nodes (e.g. ["true","false"] or case names). */
  outputs?: string[];
  /** When true, the engine skips this node and passes data through to successors. */
  disabled?: boolean;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string; // "match" / "no-match" / "error" for conditions/error handlers
};

// ── Items / array data model ─────────────────────────────────────

export type WorkflowItem = {
  /** The JSON payload for this item. */
  json: Record<string, unknown>;
  /** Optional binary attachments keyed by name. */
  binary?: Record<string, { data: string; mimeType: string; fileName?: string }>;
  /** The node that produced this item. */
  sourceNodeId?: string;
};

export type NodeOutputSchema = {
  /** Property definitions for the node's output. */
  properties: Record<string, { type: string; description?: string }>;
  /** Whether the output is an array of items. */
  isArray?: boolean;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  runCount: number;
  /** Current version number, incremented on each save. */
  version?: number;
};

// ── Execution results ─────────────────────────────────────────────

export type NodeExecutionStatus = "success" | "error" | "skipped" | "retrying";

export type NodeExecutionResult = {
  nodeId: string;
  nodeLabel: string;
  nodeType: WorkflowNodeType;
  status: NodeExecutionStatus;
  startedAt: number;
  completedAt: number;
  /** Context snapshot BEFORE this node executed (for input inspection). */
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  /** Number of retries attempted before success or final failure. */
  retryCount?: number;
  /** Whether this result used pinned data instead of live execution. */
  pinned?: boolean;
};

export type WorkflowExecutionStatus = "running" | "completed" | "failed" | "cancelled";

export type WorkflowExecution = {
  id: string;
  workflowId: string;
  workflowName: string;
  triggeredBy: string; // trigger node ID or "manual"
  triggerData?: Record<string, unknown>;
  status: WorkflowExecutionStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  nodeResults: NodeExecutionResult[];
  error?: string;
  /** If this execution was a sub-workflow, the parent execution ID. */
  parentExecutionId?: string;
};

// ── Execution callbacks (for real-time monitoring) ───────────────

export type ExecutionCallbacks = {
  /** Called when a node starts executing. */
  onNodeStart?: (
    executionId: string,
    nodeId: string,
    nodeLabel: string,
    nodeType: WorkflowNodeType,
  ) => void;
  /** Called when a node finishes executing (success, error, or skipped). */
  onNodeComplete?: (executionId: string, result: NodeExecutionResult) => void;
  /** Called when the entire execution starts. */
  onExecutionStart?: (executionId: string, workflowId: string, workflowName: string) => void;
  /** Called when the entire execution finishes. */
  onExecutionComplete?: (executionId: string, execution: WorkflowExecution) => void;
};

// ── Dependencies injected into action executors ───────────────────

export type ActionDependencies = {
  /** Call a gateway RPC method (send messages, LLM, etc.) */
  gatewayRpc: (
    method: string,
    params: Record<string, unknown>,
  ) => Promise<{
    ok: boolean;
    payload?: Record<string, unknown>;
    error?: string;
  }>;

  /** Kill switch control */
  killSwitch: {
    activate: (reason: string, actor: string, mode?: "hard" | "soft") => Promise<void>;
    deactivate: (actor: string) => Promise<void>;
    check: () => Promise<{ active: boolean; reason?: string }>;
  };

  /** Log messages to execution history */
  log: (message: string) => void;

  /** Load a workflow by ID (for sub-workflow execution). */
  loadWorkflow?: (id: string) => Workflow | null;

  /** Resolve a credential by ID. */
  resolveCredential?: (id: string) => Record<string, string> | null;
};

// ── Credential vault types ────────────────────────────────────────

export type StoredCredential = {
  id: string;
  name: string;
  type: string; // e.g. "api_key", "oauth2", "basic_auth", "custom"
  fields: Record<string, string>; // encrypted at rest
  createdAt: string;
  updatedAt: string;
};

// ── Version history types ─────────────────────────────────────────

export type WorkflowVersion = {
  version: number;
  workflow: Workflow;
  savedAt: string;
  description?: string;
};
