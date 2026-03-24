import { Bell, X, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useNotificationStore, type NotificationSeverity } from "@/stores/notification-store";

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  switch (severity) {
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
    case "error":
      return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    case "info":
      return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
  }
}

const SEVERITY_BG: Record<NotificationSeverity, string> = {
  success: "bg-green-900/20",
  error: "bg-red-900/20",
  warning: "bg-amber-900/20",
  info: "bg-blue-900/20",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useNotificationStore((s) => s.notifications);
  const undismissedCount = notifications.filter((n) => !n.dismissed).length;
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/[0.07] transition-all duration-200 cursor-pointer"
        title="Trading notifications"
      >
        <Bell className="w-4 h-4 text-neutral-400" />
        {undismissedCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            {undismissedCount > 9 ? "9+" : undismissedCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/[0.08] bg-neutral-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Notifications
              </span>
              {undismissedCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-600">No notifications yet</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 border-b border-white/[0.04] transition-all duration-200",
                    n.dismissed ? "opacity-40" : "hover:bg-white/[0.04]",
                    SEVERITY_BG[n.severity],
                  )}
                >
                  <SeverityIcon severity={n.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-neutral-200 truncate">{n.title}</div>
                    <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                      {n.description}
                    </div>
                    <div className="text-[10px] text-neutral-600 mt-1">
                      {new Date(n.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {!n.dismissed && (
                    <button
                      onClick={() => dismissNotification(n.id)}
                      className="p-0.5 rounded hover:bg-white/[0.1] transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-3 h-3 text-neutral-500" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
