import { describe, expect, it } from "vitest";
import {
  resolveMcpAuthConfig,
  validateMcpToken,
  authorizeToolCall,
  MCP_TOOL_SCOPE_MAP,
} from "../mcp-auth.js";

describe("resolveMcpAuthConfig", () => {
  it("returns token from TIGERPAW_MCP_TOKEN env var", () => {
    const config = resolveMcpAuthConfig({ TIGERPAW_MCP_TOKEN: "abc123" });
    expect(config.token).toBe("abc123");
  });

  it("returns undefined token when env var is not set", () => {
    const config = resolveMcpAuthConfig({});
    expect(config.token).toBeUndefined();
  });

  it("returns undefined token when env var is empty string", () => {
    const config = resolveMcpAuthConfig({ TIGERPAW_MCP_TOKEN: "  " });
    expect(config.token).toBeUndefined();
  });

  it("parses TIGERPAW_MCP_SCOPES into scope array", () => {
    const config = resolveMcpAuthConfig({ TIGERPAW_MCP_SCOPES: "read, trade" });
    expect(config.scopes).toEqual(["read", "trade"]);
  });

  it("returns undefined scopes when env var is not set", () => {
    const config = resolveMcpAuthConfig({});
    expect(config.scopes).toBeUndefined();
  });

  it("ignores unknown scope values", () => {
    const config = resolveMcpAuthConfig({ TIGERPAW_MCP_SCOPES: "read,bogus,admin" });
    expect(config.scopes).toEqual(["read", "admin"]);
  });

  it("returns undefined scopes when all values are invalid", () => {
    const config = resolveMcpAuthConfig({ TIGERPAW_MCP_SCOPES: "foo,bar" });
    expect(config.scopes).toBeUndefined();
  });
});

describe("validateMcpToken", () => {
  it("returns authenticated when no token is configured", () => {
    expect(validateMcpToken(undefined, {})).toBe("authenticated");
  });

  it("returns authenticated when provided token matches config token", () => {
    expect(validateMcpToken("secret", { token: "secret" })).toBe("authenticated");
  });

  it("returns rejected when provided token does not match", () => {
    expect(validateMcpToken("wrong", { token: "secret" })).toBe("rejected");
  });

  it("returns rejected when provided token is undefined but config has token", () => {
    expect(validateMcpToken(undefined, { token: "secret" })).toBe("rejected");
  });

  it("returns rejected when provided token is empty string but config has token", () => {
    expect(validateMcpToken("", { token: "secret" })).toBe("rejected");
  });
});

describe("authorizeToolCall", () => {
  it("returns true when scopes is undefined", () => {
    expect(authorizeToolCall("place_order", undefined)).toBe(true);
  });

  it("returns true when scopes is empty array", () => {
    expect(authorizeToolCall("place_order", [])).toBe(true);
  });

  it("returns true for read tool when scopes includes read", () => {
    expect(authorizeToolCall("get_trading_state", ["read"])).toBe(true);
  });

  it("returns false for trade tool when scopes only includes read", () => {
    expect(authorizeToolCall("place_order", ["read"])).toBe(false);
  });

  it("returns true for any tool when scopes includes admin", () => {
    expect(authorizeToolCall("toggle_kill_switch", ["admin"])).toBe(true);
    expect(authorizeToolCall("place_order", ["admin"])).toBe(true);
    expect(authorizeToolCall("get_positions", ["admin"])).toBe(true);
  });

  it("returns false for unknown tool name", () => {
    expect(authorizeToolCall("nonexistent_tool", ["read", "trade"])).toBe(false);
  });

  it("returns true for trade tool when scopes include trade", () => {
    expect(authorizeToolCall("place_order", ["read", "trade"])).toBe(true);
  });
});

describe("MCP_TOOL_SCOPE_MAP", () => {
  it("maps all 8 tools to expected scopes", () => {
    expect(MCP_TOOL_SCOPE_MAP.get_trading_state).toBe("read");
    expect(MCP_TOOL_SCOPE_MAP.get_positions).toBe("read");
    expect(MCP_TOOL_SCOPE_MAP.get_trade_history).toBe("read");
    expect(MCP_TOOL_SCOPE_MAP.get_risk_metrics).toBe("read");
    expect(MCP_TOOL_SCOPE_MAP.list_strategies).toBe("read");
    expect(MCP_TOOL_SCOPE_MAP.run_backtest).toBe("read");
    expect(MCP_TOOL_SCOPE_MAP.place_order).toBe("trade");
    expect(MCP_TOOL_SCOPE_MAP.toggle_kill_switch).toBe("admin");
  });
});
