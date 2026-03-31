import { Search, Inbox, CheckCheck, Mail, MailOpen, Filter, Bell, Shield } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DataModeSelector } from "@/components/DataModeSelector";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMessageHubStore, type MessageHubMessage } from "@/stores/message-hub-store";

const CHANNELS = [
  { id: "discord", label: "Discord" },
  { id: "telegram", label: "Telegram" },
  { id: "slack", label: "Slack" },
  { id: "signal", label: "Signal" },
  { id: "whatsapp", label: "WhatsApp" },
];

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const date = new Date(timestamp);
  const hh = date.getHours();
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 || 12;

  if (days < 2) {
    return `Yesterday ${h12}:${mm} ${ampm}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${h12}:${mm} ${ampm}`;
}

function getDateGroup(timestamp: number): "today" | "yesterday" | "earlier" {
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  if (timestamp >= todayStart) {
    return "today";
  }
  if (timestamp >= yesterdayStart) {
    return "yesterday";
  }
  return "earlier";
}

function TypeBadge({ type }: { type: MessageHubMessage["type"] }) {
  if (type === "message") {
    return null;
  }

  if (type === "approval") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 border-amber-700/50 text-amber-400 bg-amber-950/30"
      >
        <Shield className="w-2.5 h-2.5 mr-0.5" />
        Approval
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 border-red-700/50 text-red-400 bg-red-950/30"
    >
      <Bell className="w-2.5 h-2.5 mr-0.5" />
      Alert
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: MessageHubMessage["priority"] }) {
  if (priority !== "high") {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 border-orange-700/50 text-orange-400 bg-orange-950/30"
    >
      High
    </Badge>
  );
}

function MessageRow({ message, onClick }: { message: MessageHubMessage; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-lg",
        "hover:bg-[var(--glass-subtle-hover)] transition-all duration-200 cursor-pointer",
        !message.read && "bg-[var(--glass-subtle)]",
      )}
    >
      {/* Unread dot */}
      <div className="flex items-center pt-1.5 w-2 shrink-0">
        {!message.read && <span className="w-2 h-2 rounded-full bg-orange-400" />}
      </div>

      {/* Channel icon */}
      <img
        src={message.channelIcon}
        alt={message.channel}
        className="w-5 h-5 shrink-0 mt-0.5 rounded"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              "text-sm truncate",
              message.read ? "text-neutral-400" : "text-neutral-100 font-semibold",
            )}
          >
            {message.sender}
          </span>
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <TypeBadge type={message.type} />
            <PriorityBadge priority={message.priority} />
          </div>
        </div>
        <p
          className={cn("text-xs truncate", message.read ? "text-neutral-500" : "text-neutral-300")}
        >
          {message.preview}
        </p>
      </div>

      {/* Timestamp + read icon */}
      <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
        <span className="text-[10px] text-neutral-500 whitespace-nowrap">
          {formatRelativeTime(message.timestamp)}
        </span>
        {message.read ? (
          <MailOpen className="w-3 h-3 text-neutral-600" />
        ) : (
          <Mail className="w-3 h-3 text-neutral-400" />
        )}
      </div>
    </div>
  );
}

export function MessageHubPage() {
  const { t } = useTranslation("messageHub");
  const {
    messages,
    filter,
    searchQuery,
    markRead,
    markAllRead,
    setFilter,
    setSearchQuery,
    unreadCount,
    unreadByChannel,
    fetchRecentMessages,
  } = useMessageHubStore();

  // Fetch real messages from gateway on mount
  useEffect(() => {
    void fetchRecentMessages();
  }, [fetchRecentMessages]);

  const channelCounts = unreadByChannel();
  const totalUnread = unreadCount();

  const filtered = useMemo(() => {
    let result = messages;

    if (filter) {
      result = result.filter((m) => m.channel === filter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.sender.toLowerCase().includes(q) ||
          m.preview.toLowerCase().includes(q) ||
          m.channel.toLowerCase().includes(q),
      );
    }

    return result.toSorted((a, b) => b.timestamp - a.timestamp);
  }, [messages, filter, searchQuery]);

  const grouped = useMemo(() => {
    const groups: Record<"today" | "yesterday" | "earlier", MessageHubMessage[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const msg of filtered) {
      groups[getDateGroup(msg.timestamp)].push(msg);
    }
    return groups;
  }, [filtered]);

  const groupLabels: Record<string, string> = {
    today: t("today", "Today"),
    yesterday: t("yesterday", "Yesterday"),
    earlier: t("earlier", "Earlier"),
  };

  const isEmpty = filtered.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">{t("title", "Message Hub")}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {t("subtitle", "All your messages in one place")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataModeSelector />
          <button
            onClick={() => markAllRead(filter ?? undefined)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
              totalUnread > 0
                ? "text-orange-400 hover:bg-orange-950/30 border border-orange-700/40 cursor-pointer"
                : "text-neutral-500 border border-neutral-800 cursor-default",
            )}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {t("markAllRead", "Mark all read")}
            {totalUnread > 0 && (
              <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-orange-600 text-white border-0">
                {totalUnread}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <Input
          placeholder={t("search", "Search messages...")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-[var(--glass-subtle)] border-[var(--glass-border)] text-neutral-200 placeholder:text-neutral-500"
        />
      </div>

      {/* Channel filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <button
          onClick={() => setFilter(null)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer",
            filter === null
              ? "bg-orange-600 text-white"
              : "bg-[var(--glass-subtle)] text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)]",
          )}
        >
          All
          {totalUnread > 0 && <span className="ml-1 text-[10px] opacity-75">({totalUnread})</span>}
        </button>
        {CHANNELS.map((ch) => {
          const count = channelCounts[ch.id] ?? 0;
          return (
            <button
              key={ch.id}
              onClick={() => setFilter(filter === ch.id ? null : ch.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer",
                filter === ch.id
                  ? "bg-orange-600 text-white"
                  : "bg-[var(--glass-subtle)] text-neutral-400 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)]",
              )}
            >
              {ch.label}
              {count > 0 && <span className="ml-1 text-[10px] opacity-75">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Message list */}
      {isEmpty ? (
        <div className="rounded-2xl glass-panel p-12 flex flex-col items-center justify-center text-center">
          <Inbox className="w-12 h-12 text-neutral-600 mb-4" />
          <p className="text-neutral-400 font-medium">{t("empty", "No messages")}</p>
          <p className="text-sm text-neutral-500 mt-1">
            {t("emptyHint", "Messages from your connected channels will appear here")}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl glass-panel p-2 space-y-1">
          {(["today", "yesterday", "earlier"] as const).map((group) => {
            const msgs = grouped[group];
            if (msgs.length === 0) {
              return null;
            }

            return (
              <div key={group}>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    {groupLabels[group]}
                  </span>
                </div>
                {msgs.map((msg) => (
                  <MessageRow key={msg.id} message={msg} onClick={() => markRead(msg.id)} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
