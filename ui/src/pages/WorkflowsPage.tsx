import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/stores/workflow-store";
import type { Workflow } from "@/stores/workflow-store";

function triggerLabel(trigger: Workflow["trigger"]): string {
  switch (trigger.type) {
    case "schedule":
      return `Schedule: ${trigger.cron}`;
    case "price":
      return `${trigger.symbol} ${trigger.condition} $${trigger.threshold.toLocaleString()}`;
    case "event":
      return `Event: ${trigger.eventName}`;
    case "manual":
      return "Manual";
  }
}

function actionSummary(actions: Workflow["actions"]): string {
  if (actions.length === 0) {
    return "No actions";
  }
  if (actions.length === 1) {
    const a = actions[0];
    switch (a.type) {
      case "trade":
        return `${a.side.toUpperCase()} ${a.quantity} ${a.symbol}`;
      case "notify":
        return `Notify via ${a.channel}`;
      case "killswitch":
        return `Kill switch: ${a.mode}`;
      case "webhook":
        return `Webhook: ${a.method} ${a.url}`;
    }
  }
  return `${actions.length} actions`;
}

export function WorkflowsPage() {
  const { workflows, loading, loadFromGateway, toggleWorkflow, deleteWorkflow } =
    useWorkflowStore();

  useEffect(() => {
    loadFromGateway();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Workflows</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Automated trading rules and notifications
          </p>
        </div>
        {loading && <span className="text-xs text-neutral-500 animate-pulse">Syncing...</span>}
      </div>

      {workflows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-neutral-400 text-sm">No workflows configured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className={cn(
                "rounded-2xl glass-panel p-4 flex items-center gap-4 transition-all duration-300",
                !wf.enabled && "opacity-50",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200 truncate">{wf.name}</span>
                  <span
                    className={cn(
                      "shrink-0 w-1.5 h-1.5 rounded-full",
                      wf.enabled ? "bg-green-500" : "bg-neutral-600",
                    )}
                  />
                </div>
                <p className="text-xs text-neutral-500 mt-0.5 truncate">{wf.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-500">
                  <span className="font-mono">{triggerLabel(wf.trigger)}</span>
                  <span>-&gt;</span>
                  <span>{actionSummary(wf.actions)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleWorkflow(wf.id)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md border transition-all duration-200 cursor-pointer",
                    wf.enabled
                      ? "border-green-700/50 bg-green-950/30 text-green-400 hover:bg-green-950/50"
                      : "border-[var(--glass-border)] text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-input-bg)]",
                  )}
                >
                  {wf.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  onClick={() => deleteWorkflow(wf.id)}
                  className="px-3 py-1 text-xs rounded-md border border-red-800/40 text-red-400/70 hover:bg-red-950/30 hover:text-red-400 transition-all duration-200 cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
