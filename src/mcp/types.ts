/** JSON-RPC 2.0 request. */
export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC 2.0 response. */
export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** JSON-RPC 2.0 notification (no id). */
export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

/** MCP tool definition. */
export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
};

/** MCP server capabilities. */
export type McpServerCapabilities = {
  tools?: { listChanged?: boolean };
};

/** MCP server info. */
export type McpServerInfo = {
  name: string;
  version: string;
};
