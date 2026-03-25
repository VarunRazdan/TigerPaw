import { Bell, X, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  type NotificationSeverity,
  eventSeverity,
} from "@/stores/notification-store";

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

const DEMO_EVENTS = [
  {
    type: "trading.order.approved",
    title: "Order Approved: AAPL BUY",
    description: "Auto-approved — AAPL BUY 10 shares $2,190.00 via alpaca",
  },
  {
    type: "trading.order.denied",
    title: "Order Denied: TSLA BUY",
    description: "Daily spend limit exceeded — TSLA BUY 3 shares $850.00",
  },
  {
    type: "trading.killswitch.activated",
    title: "Kill Switch Activated",
    description: "Hard mode [global] — daily loss limit breached (3.2%)",
  },
  {
    type: "trading.limit.warning",
    title: "Limit Warning: dailySpend",
    description: "Daily spend at 82% of $100 limit",
  },
  {
    type: "trading.order.filled",
    title: "Order Filled: BTC-USD",
    description: "BTC-USD BUY $500.00 via coinbase",
  },
];
let demoIdx = 0;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useNotificationStore((s) => s.notifications);
  const undismissedCount = notifications.filter((n) => !n.dismissed).length;
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const fireTestNotification = () => {
    const demo = DEMO_EVENTS[demoIdx % DEMO_EVENTS.length];
    demoIdx++;
    addNotification({
      type: demo.type,
      title: demo.title,
      description: demo.description,
      severity: eventSeverity(demo.type),
      timestamp: Date.now(),
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-[var(--glass-input-bg)] transition-all duration-200 cursor-pointer"
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
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--glass-dropdown)] backdrop-blur-xl shadow-2xl shadow-black/50 z-50">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--glass-subtle-hover)]">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Notifications
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={fireTestNotification}
                  className="text-[10px] text-orange-500/70 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Test
                </button>
                {undismissedCount > 0 && (
                  <button
                    onClick={() => {
                      clearAll();
                      setOpen(false);
                    }}
                    className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-600">No notifications yet</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 border-b border-[var(--glass-divider)] transition-all duration-200",
                    n.dismissed ? "opacity-40" : "hover:bg-[var(--glass-divider)]",
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
                      className="p-0.5 rounded hover:bg-[var(--glass-border)] transition-colors cursor-pointer shrink-0"
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
