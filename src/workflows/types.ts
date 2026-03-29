/**
 * Workflow execution types.
 *
 * These types define the runtime shape of workflow nodes and execution results.
 * The workflow graph is stored as nodes + edges (same as the UI/store model);
 * these types add execution semantics on top.
 */

// ── Node config shapes (per subtype) ──────────────────────────────

export type TriggerSubtype = "cron" | "trading.event" | "message.received" | "webhook" | "manual";
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
  | "run_workflow";
export type TransformSubtype = "extract_data" | "format_text" | "parse_json";

export type WorkflowNodeType = "trigger" | "condition" | "action" | "transform" | "error_handler";

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
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string; // "match" / "no-match" / "error" for conditions/error handlers
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
  output?: Record<string, unknown>;
  error?: string;
  /** Number of retries attempted before success or final failure. */
  retryCount?: number;
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
