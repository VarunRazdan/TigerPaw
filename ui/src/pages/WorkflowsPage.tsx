import { Plus, Workflow, Play, Pause, Trash2, Clock, Zap, MessageSquare, Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/stores/workflow-store";

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
] as const;

function triggerBadge(nodes: { type: string; subtype: string }[]) {
  const trigger = nodes.find((n) => n.type === "trigger");
  if (!trigger) {
    return null;
  }

  const map: Record<string, { label: string; variant: "default" | "warning" | "secondary" }> = {
    "trading.order.denied": { label: "Trading Event", variant: "warning" },
    "message.received": { label: "Message", variant: "default" },
    cron: { label: "Scheduled", variant: "secondary" },
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
  const { workflows, toggleWorkflow, deleteWorkflow, addWorkflow } = useWorkflowStore();

  const handleUseTemplate = (tplId: string) => {
    // Find matching demo workflow to clone
    const sourceMap: Record<string, string> = {
      "tpl-trading-alert": "wf-trading-alert",
      "tpl-message-router": "wf-message-router",
      "tpl-daily-digest": "wf-daily-digest",
    };
    const sourceId = sourceMap[tplId];
    const source = useWorkflowStore.getState().getWorkflow(sourceId);
    if (!source) {
      return;
    }

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
  };

  // Separate demo/template workflows from user-created ones
  const demoIds = new Set(["wf-trading-alert", "wf-message-router", "wf-daily-digest"]);
  const customWorkflows = workflows.filter((w) => !demoIds.has(w.id));

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
        <Link
          to="/workflows/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          {t("create", "Create Workflow")}
        </Link>
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
