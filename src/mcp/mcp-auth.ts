/**
 * MCP authentication and scope authorization.
 *
 * Provides token-based auth for the MCP stdio server.
 * When TIGERPAW_MCP_TOKEN is set, clients must send the token
 * in the `initialize` request via `params._meta.auth.token`.
 * When not set, the server operates in unauthenticated mode (backward compatible).
 */

import { safeEqualSecret } from "../security/secret-equal.js";

export type McpAuthState = "pending" | "authenticated" | "rejected";

export type McpToolScope = "read" | "trade" | "admin";

export type McpAuthConfig = {
  token?: string;
  scopes?: McpToolScope[];
};

/**
 * Maps each MCP tool to the minimum scope required to call it.
 * "admin" implies access to all tools.
 */
export const MCP_TOOL_SCOPE_MAP: Record<string, McpToolScope> = {
  get_trading_state: "read",
  get_positions: "read",
  get_trade_history: "read",
  get_risk_metrics: "read",
  list_strategies: "read",
  run_backtest: "read",
  place_order: "trade",
  toggle_kill_switch: "admin",
};

const VALID_SCOPES = new Set<McpToolScope>(["read", "trade", "admin"]);

/**
 * Resolve MCP auth config from environment variables.
 */
export function resolveMcpAuthConfig(env: Record<string, string | undefined>): McpAuthConfig {
  const token = env.TIGERPAW_MCP_TOKEN?.trim() || undefined;

  let scopes: McpToolScope[] | undefined;
  const scopesRaw = env.TIGERPAW_MCP_SCOPES?.trim();
  if (scopesRaw) {
    scopes = scopesRaw
      .split(",")
      .map((s) => s.trim().toLowerCase() as McpToolScope)
      .filter((s) => VALID_SCOPES.has(s));
    if (scopes.length === 0) {
      scopes = undefined;
    }
  }

  return { token, scopes };
}

/**
 * Validate a client-provided token against the expected token.
 * Returns "authenticated" if no token is configured (backward compatible).
 */
export function validateMcpToken(
  provided: string | undefined,
  config: McpAuthConfig,
): McpAuthState {
  if (!config.token) {
    return "authenticated";
  }
  if (!provided) {
    return "rejected";
  }
  return safeEqualSecret(provided, config.token) ? "authenticated" : "rejected";
}

/**
 * Check whether a tool call is authorized under the given scopes.
 * Returns true if no scopes are configured (no restrictions).
 * "admin" scope grants access to all tools.
 */
export function authorizeToolCall(toolName: string, scopes: McpToolScope[] | undefined): boolean {
  if (!scopes || scopes.length === 0) {
    return true;
  }
  if (scopes.includes("admin")) {
    return true;
  }

  const required = MCP_TOOL_SCOPE_MAP[toolName];
  if (!required) {
    return false;
  }
  return scopes.includes(required);
}
