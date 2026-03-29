import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  type NotificationSeverity,
  type TradingNotification,
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

const SEVERITY_BORDER: Record<NotificationSeverity, string> = {
  success: "border-green-600/30",
  error: "border-red-600/30",
  warning: "border-amber-600/30",
  info: "border-blue-600/30",
};

const SEVERITY_ACCENT: Record<NotificationSeverity, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

function ToastItem({
  notification,
  onDone,
}: {
  notification: TradingNotification;
  onDone: (id: string) => void;
}) {
  return (
    <ToastPrimitive.Root
      duration={5000}
      onOpenChange={(open) => {
        if (!open) {
          onDone(notification.id);
        }
      }}
      className={cn(
        "group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl transition-all",
        "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=closed]:fade-out-0",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
        "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform",
        "data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full",
        "bg-[rgba(15,12,8,0.92)] border-[var(--glass-border)]",
        SEVERITY_BORDER[notification.severity],
      )}
    >
      {/* Accent bar on the left */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-0.5 rounded-full",
          SEVERITY_ACCENT[notification.severity],
        )}
      />

      <SeverityIcon severity={notification.severity} />
      <div className="flex-1 min-w-0">
        <ToastPrimitive.Title className="text-sm font-medium text-neutral-200 truncate">
          {notification.title}
        </ToastPrimitive.Title>
        <ToastPrimitive.Description className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
          {notification.description}
        </ToastPrimitive.Description>
      </div>
      <ToastPrimitive.Close className="p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-[var(--glass-input-bg)] transition-colors cursor-pointer opacity-0 group-hover:opacity-100 shrink-0">
        <X className="w-3 h-3" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastNotifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const toastsEnabled = useNotificationStore((s) => s.toastsEnabled);
  const [toasts, setToasts] = useState<TradingNotification[]>([]);
  const seenIds = useRef(new Set<string>());

  // Seed seen IDs with initial notifications (demo data) so they don't all toast on mount
  useEffect(() => {
    for (const n of notifications) {
      seenIds.current.add(n.id);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for NEW notifications added after mount
  useEffect(() => {
    const newToasts: TradingNotification[] = [];
    for (const n of notifications) {
      if (!seenIds.current.has(n.id)) {
        seenIds.current.add(n.id);
        if (toastsEnabled) {
          newToasts.push(n);
        }
      }
    }
    if (newToasts.length > 0) {
      setToasts((prev) => [...prev, ...newToasts]);
    }
  }, [notifications, toastsEnabled]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {toasts.slice(-3).map((t) => (
        <ToastItem key={t.id} notification={t} onDone={removeToast} />
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[380px] max-w-[calc(100vw-2rem)] outline-none" />
    </ToastPrimitive.Provider>
  );
}
