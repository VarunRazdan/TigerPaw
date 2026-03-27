import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type TransportType = "stdio" | "sse";
type ConnectionStatus = "connected" | "disconnected" | "error";

interface McpServer {
  id: string;
  name: string;
  transport: TransportType;
  command?: string;
  url?: string;
  status: ConnectionStatus;
  toolCount: number;
  lastConnected: number | null;
  error?: string;
}

interface ExposedTool {
  name: string;
  description: string;
}

interface EnvVar {
  key: string;
  value: string;
}

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                 */
/* -------------------------------------------------------------------------- */

const DEMO_SERVERS: McpServer[] = [
  {
    id: "1",
    name: "GitHub",
    transport: "stdio",
    command: "npx @modelcontextprotocol/server-github",
    status: "connected",
    toolCount: 12,
    lastConnected: Date.now() - 300000,
  },
  {
    id: "2",
    name: "Filesystem",
    transport: "stdio",
    command: "npx @modelcontextprotocol/server-filesystem /home/user",
    status: "connected",
    toolCount: 6,
    lastConnected: Date.now() - 60000,
  },
  {
    id: "3",
    name: "Postgres",
    transport: "sse",
    url: "http://localhost:3001/sse",
    status: "error",
    toolCount: 0,
    lastConnected: null,
    error: "Connection refused",
  },
];

const DEMO_EXPOSED_TOOLS: ExposedTool[] = [
  { name: "trading_portfolio_summary", description: "Get portfolio overview across all platforms" },
  { name: "trading_killswitch_activate", description: "Activate the global kill switch" },
  { name: "assistant_add_task", description: "Add a task to the personal assistant" },
  { name: "assistant_daily_briefing", description: "Generate daily briefing" },
  { name: "workflow_trigger", description: "Manually trigger a workflow" },
  { name: "send_message", description: "Send a message via any connected channel" },
];

const DEMO_AUTH_TOKEN = "tp_mcp_a4f8c9d1e2b3…7k6m5";

const DEMO_SERVER_TOOLS: Record<string, string[]> = {
  "1": [
    "create_issue",
    "list_issues",
    "create_pull_request",
    "list_pull_requests",
    "get_file_contents",
    "create_branch",
    "search_code",
    "list_commits",
    "merge_pull_request",
    "get_repository",
    "list_repositories",
    "create_comment",
  ],
  "2": [
    "read_file",
    "write_file",
    "list_directory",
    "create_directory",
    "move_file",
    "search_files",
  ],
  "3": [],
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(ts: number | null): string {
  if (ts === null) {
    return "Never";
  }
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function statusColor(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return { dot: "bg-green-400", text: "text-green-400", badge: "success" as const };
    case "error":
      return { dot: "bg-red-400", text: "text-red-400", badge: "destructive" as const };
    case "disconnected":
      return { dot: "bg-neutral-500", text: "text-neutral-500", badge: "secondary" as const };
  }
}

/* -------------------------------------------------------------------------- */
/*  Server Card                                                               */
/* -------------------------------------------------------------------------- */

function ServerCard({
  server,
  expanded,
  onToggle,
  onTest,
  t,
  tools: toolsList,
}: {
  server: McpServer;
  expanded: boolean;
  onToggle: () => void;
  onTest: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  tools: string[];
}) {
  const colors = statusColor(server.status);
  const tools = toolsList;

  return (
    <div className="rounded-xl glass-panel-interactive overflow-hidden transition-all duration-300">
      {/* Card header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer"
      >
        {/* Icon */}
        <div className="shrink-0 h-10 w-10 rounded-lg bg-[var(--glass-subtle-hover)] flex items-center justify-center">
          {server.transport === "stdio" ? (
            <Terminal className="h-5 w-5 text-neutral-400" />
          ) : (
            <Globe className="h-5 w-5 text-neutral-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-100 truncate">{server.name}</span>
            <Badge variant={colors.badge} className="text-[10px] px-1.5 py-0">
              {t(`status.${server.status}`, server.status)}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 truncate mt-0.5 font-mono">
            {server.transport === "stdio" ? server.command : server.url}
          </p>
        </div>

        {/* Meta */}
        <div className="shrink-0 flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-xs text-neutral-400 block">
              {server.toolCount} {t("servers.tools", "tools")}
            </span>
            <span className="text-[10px] text-neutral-600 block">
              {formatRelativeTime(server.lastConnected)}
            </span>
          </div>
          <div className="text-neutral-500">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[var(--glass-subtle-hover)]">
          {/* Error banner */}
          {server.status === "error" && server.error && (
            <div className="mx-4 mt-3 rounded-lg bg-red-950/30 border border-red-800/50 px-3 py-2 text-xs text-red-400">
              {server.error}
            </div>
          )}

          {/* Transport details */}
          <div className="px-4 pt-3 pb-1 flex items-center gap-3 text-xs">
            <span className="text-neutral-500">{t("servers.transport", "Transport")}:</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {server.transport.toUpperCase()}
            </Badge>
            <span className="text-neutral-500 ml-auto">
              {t("servers.lastConnected", "Last connected")}:
            </span>
            <span className="text-neutral-400">{formatRelativeTime(server.lastConnected)}</span>
          </div>

          {/* Tool list */}
          {tools.length > 0 && (
            <div className="px-4 pt-2 pb-3">
              <p className="text-xs text-neutral-500 mb-2">
                {t("servers.availableTools", "Available tools")} ({tools.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--glass-subtle)] text-neutral-400 border border-[var(--glass-border)]"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action row */}
          <div className="px-4 pb-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onTest}>
              <RefreshCw className="h-3 w-3 mr-1" />
              {t("servers.testConnection", "Test Connection")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add Server Dialog                                                         */
/* -------------------------------------------------------------------------- */

function AddServerDialog({
  open,
  onOpenChange,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<TransportType>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: "", value: "" }]);

  function handleAddEnvVar() {
    setEnvVars((prev) => [...prev, { key: "", value: "" }]);
  }

  function handleUpdateEnvVar(index: number, field: "key" | "value", val: string) {
    setEnvVars((prev) => prev.map((ev, i) => (i === index ? { ...ev, [field]: val } : ev)));
  }

  function handleRemoveEnvVar(index: number) {
    setEnvVars((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    // In production this would dispatch to a store / backend
    onOpenChange(false);
    setName("");
    setTransport("stdio");
    setCommand("");
    setUrl("");
    setEnvVars([{ key: "", value: "" }]);
  }

  const canSave = name.trim().length > 0 && (transport === "stdio" ? command.trim() : url.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog.title", "Add MCP Server")}</DialogTitle>
          <DialogDescription>
            {t("dialog.description", "Configure a new Model Context Protocol server connection.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-400">{t("dialog.name", "Name")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dialog.namePlaceholder", "e.g. GitHub, Postgres")}
            />
          </div>

          {/* Transport */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-400">{t("dialog.transport", "Transport")}</label>
            <div className="flex gap-2">
              {(["stdio", "sse"] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTransport(tp)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all duration-200 cursor-pointer",
                    transport === tp
                      ? "border-orange-600 bg-orange-600/10 text-orange-400"
                      : "border-[var(--glass-border)] text-neutral-500 hover:border-[var(--glass-hover-strong)] hover:text-neutral-300",
                  )}
                >
                  {tp === "stdio" ? (
                    <Terminal className="h-3.5 w-3.5" />
                  ) : (
                    <Globe className="h-3.5 w-3.5" />
                  )}
                  {tp.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Command / URL (conditional) */}
          {transport === "stdio" ? (
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400">{t("dialog.command", "Command")}</label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx @modelcontextprotocol/server-..."
                className="font-mono text-xs"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400">{t("dialog.url", "URL")}</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3001/sse"
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Environment variables */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-400">
                {t("dialog.envVars", "Environment variables")}
              </label>
              <button
                type="button"
                onClick={handleAddEnvVar}
                className="text-[10px] text-orange-400 hover:text-orange-300 cursor-pointer transition-colors duration-200"
              >
                + {t("dialog.addVar", "Add")}
              </button>
            </div>
            <div className="space-y-1.5">
              {envVars.map((ev, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={ev.key}
                    onChange={(e) => handleUpdateEnvVar(i, "key", e.target.value)}
                    placeholder="KEY"
                    className="flex-1 font-mono text-[11px]"
                  />
                  <span className="text-neutral-600 text-xs">=</span>
                  <Input
                    value={ev.value}
                    onChange={(e) => handleUpdateEnvVar(i, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 font-mono text-[11px]"
                  />
                  {envVars.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEnvVar(i)}
                      className="text-neutral-600 hover:text-red-400 text-xs cursor-pointer transition-colors duration-200 px-1"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("dialog.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t("dialog.save", "Add Server")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export function McpPage() {
  const { t } = useTranslation("mcp");

  // Server + tools state (gateway-fetched or demo fallback)
  const [servers, setServers] = useState<McpServer[]>(DEMO_SERVERS);
  const [serverTools, setServerTools] = useState<Record<string, string[]>>(DEMO_SERVER_TOOLS);

  // Connected-servers state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [_testingServers, setTestingServers] = useState<Set<string>>(new Set());

  // Fetch real MCP server data from gateway on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchMcpData() {
      try {
        const result = await gatewayRpc<{
          servers?: Array<{
            id: string;
            name: string;
            transport: TransportType;
            command?: string;
            url?: string;
            status: string;
            toolCount: number;
            tools: string[];
          }>;
        }>("mcp.servers.list", {});
        if (cancelled) {
          return;
        }
        if (
          result.ok &&
          Array.isArray(result.payload?.servers) &&
          result.payload.servers.length > 0
        ) {
          const liveServers: McpServer[] = result.payload.servers.map((s) => ({
            id: s.id,
            name: s.name,
            transport: s.transport,
            command: s.command,
            url: s.url,
            status: (s.status as ConnectionStatus) ?? "disconnected",
            toolCount: s.toolCount,
            lastConnected: s.status === "connected" ? Date.now() : null,
          }));
          setServers(liveServers);

          // Build tools map
          const toolsMap: Record<string, string[]> = {};
          for (const s of result.payload.servers) {
            toolsMap[s.id] = s.tools;
          }
          setServerTools(toolsMap);
        }
      } catch {
        // Gateway offline — keep demo data
      }
    }
    void fetchMcpData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Expose-as-server state
  const [exposeEnabled, setExposeEnabled] = useState(false);
  const [port, setPort] = useState(18790);
  const [tokenCopied, setTokenCopied] = useState(false);

  function toggleExpanded(id: string) {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleTestConnection(id: string) {
    setTestingServers((prev) => new Set(prev).add(id));
    // Simulate connection test
    setTimeout(() => {
      setTestingServers((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1500);
  }

  function handleCopyToken() {
    navigator.clipboard.writeText(DEMO_AUTH_TOKEN).catch(() => {});
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  function handleCopyUrl() {
    navigator.clipboard.writeText(`http://localhost:${port}`).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-100">{t("title", "MCP Protocol")}</h1>
        <p className="text-sm text-neutral-400 mt-1">
          {t("subtitle", "Connect to external tool servers and expose Tigerpaw tools to AI agents")}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 -- Connected Servers (MCP Client)                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-neutral-100">
              {t("servers.heading", "Connected Servers")}
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              {t("servers.clientBadge", "MCP Client")}
            </Badge>
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("servers.add", "Add Server")}
          </Button>
        </div>

        <p className="text-xs text-neutral-500">
          {t(
            "servers.description",
            "Connect to MCP-compatible tool servers. Tigerpaw acts as a client and can invoke tools exposed by these servers.",
          )}
        </p>

        {/* Server list */}
        <div className="space-y-2">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              expanded={expandedServers.has(server.id)}
              onToggle={() => toggleExpanded(server.id)}
              onTest={() => handleTestConnection(server.id)}
              t={t}
              tools={serverTools[server.id] ?? []}
            />
          ))}
        </div>

        {servers.length === 0 && (
          <div className="rounded-2xl glass-panel p-8 text-center">
            <Server className="h-8 w-8 text-neutral-600 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">
              {t("servers.empty", "No MCP servers configured yet.")}
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              {t("servers.emptyHint", 'Click "Add Server" to connect to an MCP tool server.')}
            </p>
          </div>
        )}
      </section>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 -- Expose as Server (MCP Server)                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-neutral-100">
            {t("expose.heading", "Expose as Server")}
          </h2>
          <Badge variant="secondary" className="text-[10px]">
            {t("expose.serverBadge", "MCP Server")}
          </Badge>
        </div>

        <p className="text-xs text-neutral-500">
          {t(
            "expose.description",
            "Expose Tigerpaw tools as an MCP server so external AI agents can invoke them.",
          )}
        </p>

        <div className="rounded-2xl glass-panel overflow-hidden">
          {/* Toggle + port row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setExposeEnabled((prev) => !prev)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 focus-visible:outline-none",
                  exposeEnabled ? "bg-orange-600" : "bg-neutral-700",
                )}
                role="switch"
                aria-checked={exposeEnabled}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-300",
                    exposeEnabled ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
              <div>
                <span className="text-sm font-medium text-neutral-200">
                  {t("expose.toggle", "Enable MCP Server")}
                </span>
                <p className="text-xs text-neutral-500">
                  {exposeEnabled
                    ? t("expose.statusOn", "Server is running")
                    : t("expose.statusOff", "Server is stopped")}
                </p>
              </div>
            </div>

            {/* Port */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-500">{t("expose.port", "Port")}</label>
              <Input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-24 font-mono text-xs text-center"
              />
            </div>
          </div>

          {/* Connection URL */}
          {exposeEnabled && (
            <>
              <Separator />
              <div className="p-4 space-y-4">
                {/* URL */}
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500">
                    {t("expose.connectionUrl", "Connection URL")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-lg bg-[var(--glass-subtle)] border border-[var(--glass-border)] px-3 py-2">
                      <ExternalLink className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                      <span className="text-sm font-mono text-neutral-200 truncate">
                        http://localhost:{port}
                      </span>
                    </div>
                    <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Auth token */}
                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-500 flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    {t("expose.authToken", "Auth Token")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center rounded-lg bg-[var(--glass-subtle)] border border-[var(--glass-border)] px-3 py-2">
                      <span className="text-sm font-mono text-neutral-400 truncate">
                        {DEMO_AUTH_TOKEN}
                      </span>
                    </div>
                    <Button variant="outline" size="icon" onClick={handleCopyToken}>
                      {tokenCopied ? (
                        <Zap className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    {t(
                      "expose.tokenHint",
                      "Include this token in the Authorization header when connecting.",
                    )}
                  </p>
                </div>

                <Separator />

                {/* Exposed tools */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-neutral-500 flex items-center gap-1.5">
                      <Zap className="h-3 w-3" />
                      {t("expose.exposedTools", "Exposed Tools")} ({DEMO_EXPOSED_TOOLS.length})
                    </label>
                  </div>
                  <div className="grid gap-1.5">
                    {DEMO_EXPOSED_TOOLS.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-center gap-3 rounded-xl bg-[var(--glass-subtle)] border border-[var(--glass-border)] px-3 py-2 transition-colors duration-200 hover:border-[var(--glass-hover-strong)]"
                      >
                        <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-mono text-neutral-200 block truncate">
                            {tool.name}
                          </span>
                          <span className="text-[10px] text-neutral-500 block truncate">
                            {tool.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Add Server dialog                                                  */}
      {/* ------------------------------------------------------------------ */}
      <AddServerDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} t={t} />
    </div>
  );
}
