/**
 * Integration SDK type definitions.
 *
 * These types define the contract for adding new integrations to Tigerpaw.
 * Each integration provides an `IntegrationDefinition` that declares its
 * auth method, available actions, and optional triggers.
 */

// ── Auth configuration (discriminated union) ────────────────────

export type OAuth2AuthConfig = {
  type: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
};

export type ApiKeyAuthConfig = {
  type: "api_key";
  /** HTTP header name for the key (default: "Authorization"). */
  headerName?: string;
  /** Header value prefix (default: "Bearer"). */
  headerPrefix?: string;
  /** Environment variable fallback for the key. */
  envVar?: string;
};

export type BearerTokenAuthConfig = { type: "bearer_token" };
export type BasicAuthConfig = { type: "basic_auth" };
export type NoAuthConfig = { type: "none" };

export type AuthConfig =
  | OAuth2AuthConfig
  | ApiKeyAuthConfig
  | BearerTokenAuthConfig
  | BasicAuthConfig
  | NoAuthConfig;

export type AuthType = AuthConfig["type"];

// ── JSON Schema (lightweight subset for input/output) ───────────

export type JsonSchemaProperty = {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  /** Mark as required at the property level (convenience flag). */
  required?: boolean;
  /** Hint for textarea rendering (e.g. message body fields). */
  format?: string;
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
};

// ── Auth context injected into execute/poll functions ────────────

export type AuthContext = {
  /** Get a fresh access token (auto-refreshed for OAuth2). */
  getAccessToken: () => Promise<string>;
  /** Get a specific credential field by key. */
  getCredentialField: (key: string) => string | undefined;
  /** All credential fields for advanced use. */
  credentials: Record<string, string>;
};

// ── Action definition ───────────────────────────────────────────

export type IntegrationActionDef = {
  /** Fully qualified name: "integrationId.action_name". */
  name: string;
  /** Human-readable display name. */
  displayName: string;
  description: string;
  /** Input schema — drives UI field generation and validation. */
  inputSchema: JsonSchema;
  /** Output schema — feeds into visual data mapping. */
  outputSchema: JsonSchema;
  /** Execute the action with resolved inputs and auth. */
  execute: (input: Record<string, unknown>, auth: AuthContext) => Promise<Record<string, unknown>>;
};

// ── Trigger definition ──────────────────────────────────────────

export type IntegrationTriggerDef = {
  /** Fully qualified name: "integrationId.trigger_name". */
  name: string;
  displayName: string;
  description: string;
  type: "polling" | "webhook";
  /** Configuration schema (fields the user fills in). */
  inputSchema: JsonSchema;
  /** Shape of emitted data. */
  outputSchema: JsonSchema;
  /** Poll interval in milliseconds (polling triggers only, default: 60000). */
  pollIntervalMs?: number;
  /** Polling function — returns new items and updated poll state. */
  poll?: (
    config: Record<string, unknown>,
    auth: AuthContext,
    lastPollState?: unknown,
  ) => Promise<{ items: Record<string, unknown>[]; newState: unknown }>;
  /** Webhook setup — returns the path and secret for registration. */
  webhookSetup?: (
    config: Record<string, unknown>,
    auth: AuthContext,
  ) => Promise<{ path: string; secret: string }>;
  /** Parse incoming webhook body into trigger data items. */
  webhookParse?: (
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) => Record<string, unknown>[];
};

// ── Integration definition (top-level contract) ─────────────────

export type IntegrationDefinition = {
  /** Unique identifier, e.g. "slack", "github". */
  id: string;
  /** Human-readable name, e.g. "Slack". */
  name: string;
  description: string;
  /** Icon filename (references icons/integration icons/n8n_integrations/). */
  icon: string;
  /** Category string — open-ended (e.g. "communication", "development", "ai"). */
  category: string;
  /** Authentication configuration. */
  auth: AuthConfig;
  /** Available actions. */
  actions: IntegrationActionDef[];
  /** Available triggers (optional). */
  triggers: IntegrationTriggerDef[];
  /** Max API calls per minute (default: 60). */
  rateLimitPerMinute?: number;
};
