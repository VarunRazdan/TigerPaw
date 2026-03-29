import {
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invokeToolHttp } from "@/lib/gateway-http";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = "urgent" | "high" | "medium" | "low";

interface Task {
  id: string;
  text: string;
  status: "open" | "completed";
  priority: Priority;
  due?: string;
  tags?: string[];
}

interface Reminder {
  id: string;
  text: string;
  triggerAt: string;
  recurring?: string;
}

interface MemoryResult {
  date: string;
  tags: string[];
  text: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSISTANT_NAME = "Jarvis";
const ASSISTANT_COLOR = "text-blue-400";

const PRIORITY_STYLES: Record<Priority, string> = {
  urgent: "bg-red-900/30 text-red-400 border-red-800",
  high: "bg-amber-900/30 text-amber-400 border-amber-800",
  medium: "bg-blue-900/30 text-blue-400 border-blue-800",
  low: "bg-neutral-800 text-neutral-400 border-neutral-700",
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", PRIORITY_STYLES[priority])}>
      {priority}
    </Badge>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-neutral-500">{message}</div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2 text-xs text-red-400">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Action Card
// ---------------------------------------------------------------------------

function QuickActionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  loading,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "rounded-2xl glass-panel-interactive p-4 text-left transition-all duration-200",
        "hover:shadow-lg cursor-pointer disabled:opacity-60 disabled:cursor-wait",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {loading ? (
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
        ) : (
          <Icon className="w-4 h-4 text-amber-400" />
        )}
        <span className="text-sm font-medium text-neutral-200">{title}</span>
      </div>
      <p className="text-xs text-neutral-500">{subtitle}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Task List Panel
// ---------------------------------------------------------------------------

function TaskListPanel() {
  const { t } = useTranslation("assistant");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<"open" | "completed" | "all">("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // New task form state
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDue, setNewDue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await invokeToolHttp<Task[]>("assistant_list_tasks", {
        status: status === "all" ? undefined : status,
      });
      if (res.ok) {
        setTasks(res.result);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Gateway not reachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks(tab);
  }, [tab, fetchTasks]);

  const handleAddTask = async () => {
    if (!newText.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await invokeToolHttp("assistant_add_task", {
        text: newText.trim(),
        priority: newPriority,
        ...(newDue ? { due: newDue } : {}),
      });
      if (res.ok) {
        setNewText("");
        setNewDue("");
        setNewPriority("medium");
        setShowForm(false);
        void fetchTasks(tab);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to add task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      const res = await invokeToolHttp("assistant_complete_task", { taskId });
      if (res.ok) {
        void fetchTasks(tab);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to complete task");
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      const res = await invokeToolHttp("assistant_delete_task", { taskId });
      if (res.ok) {
        void fetchTasks(tab);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to delete task");
    }
  };

  const filtered = tab === "all" ? tasks : tasks.filter((t) => t.status === tab);

  return (
    <div className="rounded-2xl glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">{t("tasks", "Tasks")}</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("addTask", "Add")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "completed" | "all")}>
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">
            {t("open", "Open")}
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex-1">
            {t("completed", "Completed")}
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1">
            {t("all", "All")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          {error && <InlineError message={error} />}

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              message={
                error
                  ? t("gatewayHint", "Start the gateway to use the assistant")
                  : t("noTasks", "No tasks yet")
              }
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg p-2 group",
                    "hover:bg-[var(--glass-subtle-hover)] transition-colors duration-200",
                  )}
                >
                  {task.status === "open" ? (
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="mt-0.5 text-neutral-600 hover:text-green-400 transition-colors cursor-pointer"
                      title={t("completeTask", "Complete")}
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm",
                        task.status === "completed"
                          ? "text-neutral-500 line-through"
                          : "text-neutral-200",
                      )}
                    >
                      {task.text}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <PriorityBadge priority={task.priority} />
                      {task.due && (
                        <span className="text-[10px] text-neutral-500 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(task.due)}
                        </span>
                      )}
                      {task.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all cursor-pointer"
                    title={t("deleteTask", "Delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add task form */}
      {showForm && (
        <div className="space-y-2 pt-2 border-t border-[var(--glass-divider)]">
          <Input
            placeholder={t("taskTextPlaceholder", "What needs to be done?")}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
          />
          <div className="flex gap-2">
            <Select value={newPriority} onValueChange={(v) => setNewPriority(v as Priority)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAddTask} disabled={submitting || !newText.trim()} size="sm">
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reminders Panel
// ---------------------------------------------------------------------------

function RemindersPanel() {
  const { t } = useTranslation("assistant");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // New reminder form state
  const [newText, setNewText] = useState("");
  const [newTriggerAt, setNewTriggerAt] = useState("");
  const [newRecurring, setNewRecurring] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invokeToolHttp<Reminder[]>("assistant_list_reminders", {});
      if (res.ok) {
        setReminders(res.result);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Gateway not reachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReminders();
  }, [fetchReminders]);

  const handleAdd = async () => {
    if (!newText.trim() || !newTriggerAt) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await invokeToolHttp("assistant_set_reminder", {
        text: newText.trim(),
        triggerAt: newTriggerAt,
        ...(newRecurring.trim() ? { recurring: newRecurring.trim() } : {}),
      });
      if (res.ok) {
        setNewText("");
        setNewTriggerAt("");
        setNewRecurring("");
        setShowForm(false);
        void fetchReminders();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to set reminder");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (reminderId: string) => {
    try {
      const res = await invokeToolHttp("assistant_cancel_reminder", {
        reminderId,
      });
      if (res.ok) {
        void fetchReminders();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to cancel reminder");
    }
  };

  return (
    <div className="rounded-2xl glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">{t("reminders", "Reminders")}</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Bell className="w-3.5 h-3.5 mr-1" />
          {t("addReminder", "Add")}
        </Button>
      </div>

      {error && <InlineError message={error} />}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
        </div>
      ) : reminders.length === 0 ? (
        <EmptyState
          message={
            error
              ? t("gatewayHint", "Start the gateway to use the assistant")
              : t("noReminders", "No active reminders")
          }
        />
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex items-start gap-2 rounded-lg p-2 group",
                "hover:bg-[var(--glass-subtle-hover)] transition-colors duration-200",
              )}
            >
              <Bell className="w-4 h-4 mt-0.5 text-amber-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-200">{r.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(r.triggerAt)}
                  </span>
                  {r.recurring && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-900/30 text-amber-400 border-amber-800"
                    >
                      {r.recurring}
                    </Badge>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleCancel(r.id)}
                className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all cursor-pointer"
                title={t("cancelReminder", "Cancel")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add reminder form */}
      {showForm && (
        <div className="space-y-2 pt-2 border-t border-[var(--glass-divider)]">
          <Input
            placeholder={t("reminderTextPlaceholder", "Remind me to...")}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={newTriggerAt}
              onChange={(e) => setNewTriggerAt(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t("cronOptional", "Cron expression (optional)")}
              value={newRecurring}
              onChange={(e) => setNewRecurring(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleAdd}
              disabled={submitting || !newText.trim() || !newTriggerAt}
              size="sm"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Search Panel
// ---------------------------------------------------------------------------

function MemorySearchPanel() {
  const { t } = useTranslation("assistant");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await invokeToolHttp<MemoryResult[]>("assistant_search_memory", {
        query: query.trim(),
      });
      if (res.ok) {
        setResults(res.result);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Gateway not reachable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl glass-panel p-4 space-y-3">
      <h3 className="text-sm font-semibold text-neutral-300">
        {t("memorySearch", "Memory Search")}
      </h3>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-500" />
          <Input
            placeholder={t("searchMemory", "Search memories...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-8"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {error && <InlineError message={error} />}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className="rounded-lg p-2 hover:bg-[var(--glass-subtle-hover)] transition-colors duration-200"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-neutral-500">{formatDateTime(r.date)}</span>
                {r.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-neutral-300 line-clamp-2">{r.text}</p>
            </div>
          ))}
        </div>
      ) : searched && !error ? (
        <EmptyState message={t("noMemoryResults", "No matching memories found")} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Briefing Preview Panel
// ---------------------------------------------------------------------------

function BriefingPanel() {
  const { t } = useTranslation("assistant");
  const [briefing, setBriefing] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invokeToolHttp<{ text: string }>("assistant_daily_briefing", {});
      if (res.ok) {
        setBriefing(res.result.text);
        setGeneratedAt(new Date().toISOString());
      } else {
        setError(res.error);
      }
    } catch {
      setError("Gateway not reachable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">
          {t("dailyBriefing", "Daily Briefing")}
        </h3>
        <Button variant="ghost" size="sm" onClick={generate} disabled={loading}>
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
          )}
          {t("generate", "Generate")}
        </Button>
      </div>

      {error && <InlineError message={error} />}

      {briefing ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">{briefing}</p>
          {generatedAt && (
            <p className="text-[10px] text-neutral-600">
              {t("generatedAt", "Generated")} {formatDateTime(generatedAt)}
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          message={
            error
              ? t("gatewayHint", "Start the gateway to use the assistant")
              : t("noBriefing", "Click Generate to create your daily briefing")
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function AssistantPage() {
  const { t } = useTranslation("assistant");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);

  // Quick action: generate briefing (scrolls to briefing panel)
  const handleQuickBriefing = async () => {
    setBriefingLoading(true);
    // Scroll to briefing panel
    const el = document.getElementById("briefing-panel");
    el?.scrollIntoView({ behavior: "smooth" });
    // Trigger the briefing panel's generate button via a brief delay
    // so the panel is visible first
    setTimeout(() => {
      const btn = el?.querySelector("button");
      btn?.click();
      setBriefingLoading(false);
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("title", "Personal Assistant")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t("subtitle", "Tasks, reminders, memory, and daily briefings")}
          </p>
        </div>

        <div className={cn("flex items-center gap-2 rounded-xl glass-panel px-3 py-2")}>
          <User className={cn("w-4 h-4", ASSISTANT_COLOR)} />
          <span className={cn("text-sm font-medium", ASSISTANT_COLOR)}>{ASSISTANT_NAME}</span>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickActionCard
          icon={Sparkles}
          title={t("quickBriefing", "Daily Briefing")}
          subtitle={t("quickBriefingDesc", "Generate your morning summary")}
          onClick={handleQuickBriefing}
          loading={briefingLoading}
        />
        <QuickActionCard
          icon={Plus}
          title={t("quickAddTask", "Add Task")}
          subtitle={t("quickAddTaskDesc", "Create a new task to track")}
          onClick={() => setShowAddTask((v) => !v)}
        />
        <QuickActionCard
          icon={Bell}
          title={t("quickSetReminder", "Set Reminder")}
          subtitle={t("quickSetReminderDesc", "Schedule a future reminder")}
          onClick={() => setShowAddReminder((v) => !v)}
        />
      </div>

      {/* Inline quick-add forms triggered by quick action cards */}
      {showAddTask && <QuickAddTaskForm onDone={() => setShowAddTask(false)} />}
      {showAddReminder && <QuickAddReminderForm onDone={() => setShowAddReminder(false)} />}

      {/* Main Content: 2-column grid on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Tasks */}
        <div className="space-y-6">
          <TaskListPanel />
        </div>

        {/* Right column: Reminders + Memory + Briefing */}
        <div className="space-y-6">
          <RemindersPanel />
          <MemorySearchPanel />
          <div id="briefing-panel">
            <BriefingPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Quick-Add Forms (shown from Quick Action cards)
// ---------------------------------------------------------------------------

function QuickAddTaskForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("assistant");
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await invokeToolHttp("assistant_add_task", {
        text: text.trim(),
        priority,
        ...(due ? { due } : {}),
      });
      if (res.ok) {
        onDone();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Gateway not reachable");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">{t("newTask", "New Task")}</h3>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t("cancel", "Cancel")}
        </Button>
      </div>
      {error && <InlineError message={error} />}
      <Input
        placeholder={t("taskTextPlaceholder", "What needs to be done?")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        autoFocus
      />
      <div className="flex gap-2">
        <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="flex-1"
        />
        <Button onClick={handleSubmit} disabled={submitting || !text.trim()}>
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("addTask", "Add")}
        </Button>
      </div>
    </div>
  );
}

function QuickAddReminderForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("assistant");
  const [text, setText] = useState("");
  const [triggerAt, setTriggerAt] = useState("");
  const [recurring, setRecurring] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim() || !triggerAt) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await invokeToolHttp("assistant_set_reminder", {
        text: text.trim(),
        triggerAt,
        ...(recurring.trim() ? { recurring: recurring.trim() } : {}),
      });
      if (res.ok) {
        onDone();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Gateway not reachable");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">
          {t("newReminder", "New Reminder")}
        </h3>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t("cancel", "Cancel")}
        </Button>
      </div>
      {error && <InlineError message={error} />}
      <Input
        placeholder={t("reminderTextPlaceholder", "Remind me to...")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2">
        <Input
          type="datetime-local"
          value={triggerAt}
          onChange={(e) => setTriggerAt(e.target.value)}
          className="flex-1"
        />
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={t("cronOptional", "Cron expression (optional)")}
          value={recurring}
          onChange={(e) => setRecurring(e.target.value)}
          className="flex-1"
        />
        <Button onClick={handleSubmit} disabled={submitting || !text.trim() || !triggerAt}>
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("setReminder", "Set")}
        </Button>
      </div>
    </div>
  );
}
