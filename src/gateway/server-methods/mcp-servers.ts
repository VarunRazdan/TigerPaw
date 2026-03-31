import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type McpServerEntry = {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  url?: string;
  status: "connected" | "disconnected" | "error";
  toolCount: number;
  tools: string[];
};

export const mcpServersHandlers: GatewayRequestHandlers = {
  "mcp.servers.list": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const mcpServers = (cfg as Record<string, unknown>).mcpServers as
        | Record<string, Record<string, unknown>>
        | undefined;

      if (!mcpServers || Object.keys(mcpServers).length === 0) {
        respond(true, { servers: [] }, undefined);
        return;
      }

      const servers: McpServerEntry[] = Object.entries(mcpServers).map(([id, serverCfg]) => {
        const transport = serverCfg.url ? "sse" : "stdio";
        const tools = Array.isArray(serverCfg.tools) ? (serverCfg.tools as string[]) : [];
        return {
          id,
          name: (serverCfg.name as string) ?? id,
          transport,
          command: serverCfg.command as string | undefined,
          url: serverCfg.url as string | undefined,
          status: serverCfg.disabled ? "disconnected" : "connected",
          toolCount: tools.length,
          tools,
        };
      });

      respond(true, { servers }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "mcp.tools.list": async ({ params, respond }) => {
    const serverId = params.serverId as string | undefined;
    try {
      const cfg = loadConfig();
      const mcpServers = (cfg as Record<string, unknown>).mcpServers as
        | Record<string, Record<string, unknown>>
        | undefined;

      if (!mcpServers) {
        respond(true, { tools: [] }, undefined);
        return;
      }

      if (serverId) {
        const serverCfg = mcpServers[serverId];
        if (!serverCfg) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "server not found"));
          return;
        }
        const tools = Array.isArray(serverCfg.tools) ? serverCfg.tools : [];
        respond(true, { tools }, undefined);
        return;
      }

      // All tools across all servers
      const allTools: Array<{ server: string; name: string }> = [];
      for (const [id, serverCfg] of Object.entries(mcpServers)) {
        const tools = Array.isArray(serverCfg.tools) ? (serverCfg.tools as string[]) : [];
        for (const tool of tools) {
          allTools.push({ server: id, name: tool });
        }
      }
      respond(true, { tools: allTools }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "mcp.server.test": async ({ params, respond }) => {
    try {
      const serverId = params.serverId as string;
      if (!serverId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "serverId is required"));
        return;
      }
      const cfg = loadConfig();
      const mcpServers = (cfg as Record<string, unknown>).mcpServers as
        | Record<string, Record<string, unknown>>
        | undefined;
      const serverCfg = mcpServers?.[serverId];
      if (!serverCfg) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "server not found"));
        return;
      }
      // Return connection test result based on config validity
      const hasEndpoint = Boolean(serverCfg.url || serverCfg.command);
      respond(
        true,
        {
          serverId,
          reachable: hasEndpoint && !serverCfg.disabled,
          transport: serverCfg.url ? "sse" : "stdio",
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "mcp.server.refreshToken": async ({ respond }) => {
    try {
      const { randomBytes } = await import("node:crypto");
      const token = randomBytes(32).toString("hex");
      respond(true, { token }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
