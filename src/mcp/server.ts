import { createInterface } from "node:readline";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  resolveMcpAuthConfig,
  validateMcpToken,
  authorizeToolCall,
  MCP_TOOL_SCOPE_MAP,
  type McpAuthConfig,
  type McpAuthState,
  type McpToolScope,
} from "./mcp-auth.js";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpServerCapabilities,
  McpServerInfo,
} from "./types.js";
import { MCP_TOOLS, executeTool } from "./tools.js";
import { validateToolArgs } from "./validate-args.js";

const log = createSubsystemLogger("mcp/server");

const SERVER_INFO: McpServerInfo = {
  name: "tigerpaw-mcp",
  version: "1.0.0",
};

const SERVER_CAPABILITIES: McpServerCapabilities = {
  tools: { listChanged: false },
};

function makeResponse(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function makeError(id: number | string, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Create an MCP session with auth state management.
 * Exported for testing — `startMcpServer` creates one internally.
 */
export function createMcpSession(authConfig: McpAuthConfig) {
  let authState: McpAuthState = authConfig.token ? "pending" : "authenticated";
  let scopes: McpToolScope[] | undefined = authConfig.token ? undefined : authConfig.scopes;

  async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    // Auth guards: before initialize, only allow initialize and ping
    if (authState === "rejected") {
      return makeError(req.id, -32600, "Authentication failed");
    }

    if (authState === "pending" && req.method !== "initialize" && req.method !== "ping") {
      return makeError(
        req.id,
        -32600,
        "Authentication required: send initialize with auth token first",
      );
    }

    switch (req.method) {
      case "initialize": {
        // Extract token from _meta.auth.token (MCP extension point)
        const meta = req.params?._meta as Record<string, unknown> | undefined;
        const auth = meta?.auth as Record<string, unknown> | undefined;
        const token = auth?.token as string | undefined;

        const result = validateMcpToken(token, authConfig);
        if (result === "rejected") {
          authState = "rejected";
          log.warn("MCP auth: rejected invalid token");
          return makeError(req.id, -32600, "Invalid authentication token");
        }

        authState = "authenticated";
        scopes = authConfig.scopes;
        log.info("MCP auth: client authenticated");

        return makeResponse(req.id, {
          protocolVersion: "2024-11-05",
          capabilities: SERVER_CAPABILITIES,
          serverInfo: SERVER_INFO,
        });
      }

      case "tools/list": {
        // Filter tools by scope if configured
        let tools = MCP_TOOLS;
        if (scopes && scopes.length > 0) {
          tools = MCP_TOOLS.filter((t) => authorizeToolCall(t.name, scopes));
        }
        return makeResponse(req.id, { tools });
      }

      case "tools/call": {
        const toolName = (req.params?.name as string) ?? "";
        const toolArgs = (req.params?.arguments as Record<string, unknown>) ?? {};

        // Scope check
        if (!authorizeToolCall(toolName, scopes)) {
          const required = MCP_TOOL_SCOPE_MAP[toolName] ?? "unknown";
          return makeResponse(req.id, {
            content: [
              {
                type: "text",
                text: `Insufficient scope for tool: ${toolName}. Required: ${required}`,
              },
            ],
            isError: true,
          });
        }

        const tool = MCP_TOOLS.find((t) => t.name === toolName);
        if (!tool) {
          return makeResponse(req.id, {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          });
        }

        // Validate arguments against the tool's schema
        const validation = validateToolArgs(tool, toolArgs);
        if (!validation.valid) {
          return makeResponse(req.id, {
            content: [{ type: "text", text: `Invalid parameters: ${validation.error}` }],
            isError: true,
          });
        }

        try {
          const result = await executeTool(toolName, toolArgs);
          return makeResponse(req.id, result);
        } catch (err) {
          return makeResponse(req.id, {
            content: [{ type: "text", text: `Tool error: ${String(err)}` }],
            isError: true,
          });
        }
      }

      case "resources/list":
        return makeResponse(req.id, { resources: [] });

      case "prompts/list":
        return makeResponse(req.id, { prompts: [] });

      case "ping":
        return makeResponse(req.id, {});

      default:
        return makeError(req.id, -32601, `Method not found: ${req.method}`);
    }
  }

  return {
    handleRequest,
    getAuthState: (): McpAuthState => authState,
  };
}

/**
 * Start the MCP server on stdio.
 * Reads JSON-RPC requests from stdin, writes responses to stdout.
 */
export function startMcpServer(): void {
  const authConfig = resolveMcpAuthConfig(process.env);

  if (authConfig.token) {
    log.info("MCP auth: token required, awaiting initialize");
  } else {
    log.info("MCP auth: no token configured, unauthenticated mode");
  }

  const session = createMcpSession(authConfig);

  log.info("MCP server starting on stdio");

  const rl = createInterface({ input: process.stdin });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const req = JSON.parse(trimmed) as JsonRpcRequest;

      // Notifications (no id) don't need a response
      if (req.id == null) {
        if (req.method === "notifications/initialized") {
          log.info("MCP client initialized");
        }
        return;
      }

      const response = await session.handleRequest(req);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: `Parse error: ${String(err)}` },
      };
      process.stdout.write(JSON.stringify(errorResponse) + "\n");
    }
  });

  rl.on("close", () => {
    log.info("MCP server stdin closed");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log.info("MCP server received SIGINT");
    process.exit(0);
  });
}

/**
 * Generate an auth token for MCP server access.
 * Simple random hex token.
 */
export async function generateMcpToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}
