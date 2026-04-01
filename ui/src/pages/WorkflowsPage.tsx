import {
  Plus,
  Workflow,
  Play,
  Pause,
  Trash2,
  Clock,
  Zap,
  MessageSquare,
  Bot,
  Webhook,
  ShieldAlert,
  Newspaper,
  BarChart3,
  Bell,
  TrendingUp,
  Scale,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { DataModeSelector } from "@/components/DataModeSelector";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkflowStore, type Workflow as WorkflowType } from "@/stores/workflow-store";

const TEMPLATES = [
  {
    id: "tpl-trading-alert",
    name: "Trading Alert",
    description: "Alert on denied trades via Discord.",
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    color: "border-amber-700/40 hover:border-amber-600/60",
  },
  {
    id: "tpl-message-router",
    name: "Message Router",
    description: "Route urgent messages to Slack.",
    icon: <MessageSquare className="w-5 h-5 text-blue-400" />,
    color: "border-blue-700/40 hover:border-blue-600/60",
  },
  {
    id: "tpl-daily-digest",
    name: "Daily Digest",
    description: "LLM summary sent via Telegram at 6 PM.",
    icon: <Bot className="w-5 h-5 text-purple-400" />,
    color: "border-purple-700/40 hover:border-purple-600/60",
  },
  {
    id: "tpl-webhook-forwarder",
    name: "Webhook Forwarder",
    description: "Receive external webhooks and relay to Slack.",
    icon: <Webhook className="w-5 h-5 text-cyan-400" />,
    color: "border-cyan-700/40 hover:border-cyan-600/60",
  },
  {
    id: "tpl-stop-loss-guardian",
    name: "Stop-Loss Guardian",
    description: "Auto-activate kill switch on large losses.",
    icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
    color: "border-red-700/40 hover:border-red-600/60",
  },
  {
    id: "tpl-news-sentiment",
    name: "News Sentiment",
    description: "Analyze headlines and alert on negative sentiment.",
    icon: <Newspaper className="w-5 h-5 text-emerald-400" />,
    color: "border-emerald-700/40 hover:border-emerald-600/60",
  },
  {
    id: "tpl-portfolio-rebalance",
    name: "Portfolio Rebalance",
    description: "Alert when holdings drift from target allocation.",
    icon: <BarChart3 className="w-5 h-5 text-orange-400" />,
    color: "border-orange-700/40 hover:border-orange-600/60",
  },
  {
    id: "tpl-risk-limit-notify",
    name: "Risk Limit Notify",
    description: "Notify when risk metrics exceed thresholds.",
    icon: <Bell className="w-5 h-5 text-yellow-400" />,
    color: "border-yellow-700/40 hover:border-yellow-600/60",
  },
  {
    id: "tpl-tradingview-signal",
    name: "TradingView Signal",
    description: "Execute trades from TradingView webhook alerts.",
    icon: <TrendingUp className="w-5 h-5 text-teal-400" />,
    color: "border-teal-700/40 hover:border-teal-600/60",
  },
  {
    id: "tpl-prediction-arb",
    name: "Prediction Arb",
    description: "Detect price gaps between prediction markets.",
    icon: <Scale className="w-5 h-5 text-indigo-400" />,
    color: "border-indigo-700/40 hover:border-indigo-600/60",
  },
] as const;

const TEMPLATE_DEFINITIONS: Record<
  string,
  Omit<WorkflowType, "id" | "createdAt" | "updatedAt" | "runCount">
> = {
  "tpl-trading-alert": {
    name: "Trading Alert",
    description: "Send a Discord alert when a trade order is denied by the policy engine.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "trading.order.denied",
        label: "Order Denied",
        config: { event: "trading.order.denied" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "send_message",
        label: "Send Discord Message",
        config: { channel: "discord", template: "Order {{symbol}} was denied: {{reason}}" },
        position: { x: 600, y: 200 },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  },
  "tpl-message-router": {
    name: "Message Router",
    description: "Route incoming messages containing 'urgent' to a dedicated Slack channel.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "message.received",
        label: "Message Received",
        config: { source: "any" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "condition",
        subtype: "contains_keyword",
        label: "Contains 'urgent'",
        config: { keyword: "urgent", caseSensitive: false },
        position: { x: 350, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "send_message",
        label: "Forward to Slack",
        config: { channel: "slack", target: "#urgent-alerts" },
        position: { x: 600, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", label: "match" },
    ],
  },
  "tpl-daily-digest": {
    name: "Daily Digest",
    description: "Generate an LLM summary of the day's activity and send it via Telegram at 6 PM.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "cron",
        label: "Cron Schedule",
        config: { expression: "0 18 * * *", timezone: "UTC" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "run_llm_task",
        label: "Run LLM Summary",
        config: { prompt: "Summarize today's activity", model: "default" },
        position: { x: 350, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "send_message",
        label: "Send Telegram",
        config: { channel: "telegram", chatId: "main" },
        position: { x: 600, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  },
  "tpl-webhook-forwarder": {
    name: "Webhook Forwarder",
    description: "Receive external webhooks and forward the payload to Slack.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "webhook",
        label: "Incoming Webhook",
        config: { path: "external-hook" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "transform",
        subtype: "format_text",
        label: "Format Payload",
        config: { template: "Webhook received: {{body}}", outputKey: "formatted" },
        position: { x: 400, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "send_message",
        label: "Send to Slack",
        config: { channel: "slack", to: "#webhooks", template: "{{formatted}}" },
        position: { x: 700, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  },
  "tpl-stop-loss-guardian": {
    name: "Stop-Loss Guardian",
    description: "Monitor trading events and activate kill switch when loss threshold is breached.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "trading.event",
        label: "Trade Executed",
        config: { event: "trading.order.filled" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "condition",
        subtype: "expression",
        label: "Loss > Threshold?",
        config: { left: "$pnlPercent", operator: "<", right: "-5" },
        position: { x: 400, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "killswitch",
        label: "Activate Kill Switch",
        config: { mode: "activate", reason: "Stop-loss threshold breached", switchMode: "soft" },
        position: { x: 700, y: 120 },
      },
      {
        id: "n4",
        type: "action",
        subtype: "send_message",
        label: "Alert Owner",
        config: {
          channel: "discord",
          template: "Kill switch activated: P&L {{pnlPercent}}% breached -5% threshold",
        },
        position: { x: 700, y: 300 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", label: "match" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  "tpl-news-sentiment": {
    name: "News Sentiment",
    description: "Analyze news headlines with an LLM and alert on negative market sentiment.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "cron",
        label: "Every 30 min",
        config: { expression: "*/30 * * * *", timezone: "UTC" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "call_webhook",
        label: "Fetch Headlines",
        config: { url: "https://api.example.com/news/latest", method: "GET" },
        position: { x: 350, y: 200 },
      },
      {
        id: "n3",
        type: "action",
        subtype: "run_llm_task",
        label: "Analyze Sentiment",
        config: {
          prompt:
            "Rate the market sentiment of these headlines as positive, neutral, or negative. Explain briefly:\n\n{{webhookResponse}}",
          model: "default",
        },
        position: { x: 600, y: 200 },
      },
      {
        id: "n4",
        type: "condition",
        subtype: "contains_keyword",
        label: "Is Negative?",
        config: { keyword: "negative", caseSensitive: false },
        position: { x: 850, y: 200 },
      },
      {
        id: "n5",
        type: "action",
        subtype: "send_message",
        label: "Send Alert",
        config: { channel: "discord", template: "Negative sentiment detected:\n{{llmResult}}" },
        position: { x: 1100, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5", label: "match" },
    ],
  },
  "tpl-portfolio-rebalance": {
    name: "Portfolio Rebalance",
    description: "Check portfolio allocation daily and alert when holdings drift from targets.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "cron",
        label: "Daily at 9 AM",
        config: { expression: "0 9 * * *", timezone: "UTC" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "run_llm_task",
        label: "Analyze Allocation",
        config: {
          prompt:
            "Given the current portfolio, check if any position has drifted more than 10% from target allocation. List positions that need rebalancing.",
          model: "default",
        },
        position: { x: 400, y: 200 },
      },
      {
        id: "n3",
        type: "condition",
        subtype: "contains_keyword",
        label: "Needs Rebalance?",
        config: { keyword: "rebalancing", caseSensitive: false },
        position: { x: 700, y: 200 },
      },
      {
        id: "n4",
        type: "action",
        subtype: "send_message",
        label: "Notify",
        config: { channel: "telegram", template: "Portfolio rebalance needed:\n{{llmResult}}" },
        position: { x: 1000, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", label: "match" },
    ],
  },
  "tpl-risk-limit-notify": {
    name: "Risk Limit Notify",
    description:
      "Alert when portfolio risk metrics (drawdown, concentration) exceed safe thresholds.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "trading.event",
        label: "Any Trading Event",
        config: {},
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "transform",
        subtype: "extract_data",
        label: "Extract Metrics",
        config: { path: "event.payload", outputKey: "metrics" },
        position: { x: 350, y: 200 },
      },
      {
        id: "n3",
        type: "condition",
        subtype: "expression",
        label: "Drawdown > 10%?",
        config: { left: "$metrics.drawdownPct", operator: ">", right: "10" },
        position: { x: 600, y: 200 },
      },
      {
        id: "n4",
        type: "action",
        subtype: "send_message",
        label: "Send Risk Alert",
        config: {
          channel: "discord",
          to: "#risk-alerts",
          template: "Risk limit breached: drawdown {{metrics.drawdownPct}}% exceeds 10% threshold",
        },
        position: { x: 900, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", label: "match" },
    ],
  },
  "tpl-tradingview-signal": {
    name: "TradingView Signal",
    description:
      "Receive TradingView webhook alerts and execute trades automatically via the policy engine.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "webhook",
        label: "TradingView Alert",
        config: { path: "tradingview", secret: "" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "transform",
        subtype: "extract_data",
        label: "Extract Symbol",
        config: { path: "body.symbol", outputKey: "symbol" },
        position: { x: 350, y: 120 },
      },
      {
        id: "n3",
        type: "transform",
        subtype: "extract_data",
        label: "Extract Action",
        config: { path: "body.action", outputKey: "action" },
        position: { x: 350, y: 280 },
      },
      {
        id: "n4",
        type: "condition",
        subtype: "expression",
        label: "Is Buy or Sell?",
        config: { left: "$action", operator: "in", right: "buy,sell" },
        position: { x: 600, y: 200 },
      },
      {
        id: "n5",
        type: "action",
        subtype: "trade",
        label: "Place Trade",
        config: {
          extensionId: "alpaca",
          symbol: "${symbol}",
          side: "${action}",
          quantity: 1,
          orderType: "market",
        },
        position: { x: 850, y: 120 },
      },
      {
        id: "n6",
        type: "action",
        subtype: "send_message",
        label: "Confirm via Telegram",
        config: {
          channel: "telegram",
          template: "TradingView signal executed: ${action} ${symbol}",
        },
        position: { x: 850, y: 280 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n1", target: "n3" },
      { id: "e3", source: "n2", target: "n4" },
      { id: "e4", source: "n3", target: "n4" },
      { id: "e5", source: "n4", target: "n5", label: "match" },
      { id: "e6", source: "n5", target: "n6" },
    ],
  },
  "tpl-prediction-arb": {
    name: "Prediction Arb",
    description:
      "Check for price discrepancies between Polymarket and Kalshi on the same event, and alert when an arbitrage opportunity is found.",
    enabled: false,
    nodes: [
      {
        id: "n1",
        type: "trigger",
        subtype: "cron",
        label: "Every 5 min",
        config: { expression: "*/5 * * * *", timezone: "UTC" },
        position: { x: 100, y: 200 },
      },
      {
        id: "n2",
        type: "action",
        subtype: "run_llm_task",
        label: "Compare Markets",
        config: {
          prompt:
            "Compare the current YES prices for the same event on Polymarket and Kalshi. If the sum of the cheapest YES on one platform and the cheapest NO on the other is less than $1.00, report the arbitrage opportunity with the exact prices and expected profit. Otherwise say NO_ARB.",
          model: "default",
        },
        position: { x: 400, y: 200 },
      },
      {
        id: "n3",
        type: "condition",
        subtype: "contains_keyword",
        label: "Arb Found?",
        config: { keyword: "NO_ARB", caseSensitive: true, negate: true },
        position: { x: 700, y: 200 },
      },
      {
        id: "n4",
        type: "action",
        subtype: "send_message",
        label: "Alert Opportunity",
        config: {
          channel: "discord",
          to: "#arb-alerts",
          template: "Prediction market arbitrage detected:\n{{llmResult}}",
        },
        position: { x: 1000, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", label: "match" },
    ],
  },
};

function triggerBadge(nodes: { type: string; subtype: string }[]) {
  const trigger = nodes.find((n) => n.type === "trigger");
  if (!trigger) {
    return null;
  }

  const map: Record<string, { label: string; variant: "default" | "warning" | "secondary" }> = {
    "trading.order.denied": { label: "Trading Event", variant: "warning" },
    "trading.order.filled": { label: "Trading Event", variant: "warning" },
    "trading.event": { label: "Trading Event", variant: "warning" },
    "message.received": { label: "Message", variant: "default" },
    cron: { label: "Scheduled", variant: "secondary" },
    webhook: { label: "Webhook", variant: "secondary" },
    manual: { label: "Manual", variant: "secondary" },
  };

  const info = map[trigger.subtype] ?? { label: trigger.subtype, variant: "secondary" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function formatLastRun(iso?: string): string {
  if (!iso) {
    return "Never";
  }
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {
    return "Just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  return `${Math.floor(hrs / 24)}d ago`;
}

export function WorkflowsPage() {
  const { t } = useTranslation("workflows");
  const { workflows, toggleWorkflow, deleteWorkflow, addWorkflow, fetchWorkflows } =
    useWorkflowStore();
  const [initialLoading, setInitialLoading] = useState(workflows.length === 0);

  // Fetch real workflows from gateway on mount
  useEffect(() => {
    void fetchWorkflows().finally(() => setInitialLoading(false));
  }, [fetchWorkflows]);

  const handleUseTemplate = (tplId: string) => {
    // Try to clone from demo workflows first
    const demoSourceMap: Record<string, string> = {
      "tpl-trading-alert": "wf-trading-alert",
      "tpl-message-router": "wf-message-router",
      "tpl-daily-digest": "wf-daily-digest",
    };
    const demoId = demoSourceMap[tplId];
    if (demoId) {
      const source = useWorkflowStore.getState().getWorkflow(demoId);
      if (source) {
        const newId = `wf-${Date.now()}`;
        addWorkflow({
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastRunAt: undefined,
          runCount: 0,
          enabled: false,
        });
        return;
      }
    }

    // Generate from built-in template definitions
    const tpl = TEMPLATE_DEFINITIONS[tplId];
    if (!tpl) {
      return;
    }
    const newId = `wf-${Date.now()}`;
    addWorkflow({
      ...tpl,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
      enabled: false,
    });
  };

  // Separate demo/template workflows from user-created ones
  const demoIds = new Set(["wf-trading-alert", "wf-message-router", "wf-daily-digest"]);
  const customWorkflows = workflows.filter((w) => !demoIds.has(w.id));

  if (initialLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("title", "Workflows")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t("subtitle", "Automate actions with visual event-driven pipelines.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataModeSelector />
          <Link
            to="/workflows/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors duration-200"
          >
            <Plus className="w-4 h-4" />
            {t("create", "Create Workflow")}
          </Link>
        </div>
      </div>

      {/* Template Gallery */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
          {t("templates", "Templates")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className={cn(
                "glass-panel rounded-2xl p-4 border transition-all duration-200",
                tpl.color,
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                {tpl.icon}
                <span className="text-sm font-semibold text-neutral-100">{tpl.name}</span>
              </div>
              <p className="text-xs text-neutral-500 mb-3">{tpl.description}</p>
              <button
                onClick={() => handleUseTemplate(tpl.id)}
                className="text-xs text-orange-400 hover:text-orange-300 font-medium cursor-pointer transition-colors duration-200"
              >
                {t("useTemplate", "Use Template")}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* My Workflows */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
          {t("myWorkflows", "My Workflows")}
        </h2>

        {/* All workflows list (demo + custom) */}
        {workflows.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <Workflow className="w-10 h-10 text-neutral-600 mb-3" />
            <p className="text-neutral-400 text-sm font-medium">{t("empty", "No workflows yet")}</p>
            <p className="text-neutral-600 text-xs mt-1">
              {t("emptyHint", "Create one from scratch or start with a template above.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                to={`/workflows/${wf.id}`}
                className="glass-panel-interactive rounded-2xl p-4 border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] transition-all duration-200 block group"
              >
                {/* Name + toggle */}
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-bold text-neutral-100 group-hover:text-orange-400 transition-colors duration-200 truncate">
                    {wf.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleWorkflow(wf.id);
                    }}
                    className={cn(
                      "shrink-0 ml-2 p-1 rounded-md cursor-pointer transition-colors duration-200",
                      wf.enabled
                        ? "text-green-400 hover:bg-green-950/40"
                        : "text-neutral-600 hover:bg-neutral-800",
                    )}
                    title={wf.enabled ? "Pause workflow" : "Enable workflow"}
                  >
                    {wf.enabled ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Description */}
                <p className="text-xs text-neutral-500 mb-3 line-clamp-2">{wf.description}</p>

                {/* Trigger badge */}
                <div className="mb-3">{triggerBadge(wf.nodes)}</div>

                {/* Stats row */}
                <div className="flex items-center justify-between text-[11px] text-neutral-600">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {wf.runCount} runs
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatLastRun(wf.lastRunAt)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteWorkflow(wf.id);
                    }}
                    className="p-1 rounded-md text-neutral-700 hover:text-red-400 hover:bg-red-950/30 cursor-pointer transition-colors duration-200"
                    title="Delete workflow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Extra empty state if only demo workflows exist */}
        {customWorkflows.length === 0 && workflows.length > 0 && (
          <div className="glass-panel rounded-2xl p-8 mt-3 flex flex-col items-center justify-center text-center">
            <Workflow className="w-8 h-8 text-neutral-700 mb-2" />
            <p className="text-neutral-500 text-xs">
              {t("emptyHint", "Create one from scratch or start with a template above.")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
