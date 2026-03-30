import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

// ── Snap particle effect ──────────────────────────────────────────────

const SNAP_MARGIN = 120;

const SNAP_COLORS: Record<NotificationSeverity, string[]> = {
  success: ["#22c55e", "#16a34a", "#4ade80", "#15803d"],
  error: ["#ef4444", "#dc2626", "#f87171", "#b91c1c"],
  warning: ["#f59e0b", "#d97706", "#fbbf24", "#b45309"],
  info: ["#3b82f6", "#2563eb", "#60a5fa", "#1d4ed8"],
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  delay: number;
  life: number;
};

type SnapEffect = {
  id: string;
  rect: DOMRect;
  severity: NotificationSeverity;
};

function SnapParticles({
  rect,
  severity,
  onComplete,
}: {
  rect: DOMRect;
  severity: NotificationSeverity;
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cw = rect.width + SNAP_MARGIN * 2;
    const ch = rect.height + SNAP_MARGIN * 2;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.scale(dpr, dpr);

    const colors = SNAP_COLORS[severity];
    const particles: Particle[] = [];

    // Severity-colored accent particles
    for (let i = 0; i < 45; i++) {
      const px = SNAP_MARGIN + Math.random() * rect.width;
      const py = SNAP_MARGIN + Math.random() * rect.height;
      // Sweep right-to-left: right side dissolves first
      const normalizedX = (px - SNAP_MARGIN) / rect.width;

      particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.25) * 4,
        vy: (Math.random() - 0.65) * 3.5,
        size: 1.5 + Math.random() * 3,
        opacity: 0.6 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: (1 - normalizedX) * 200,
        life: 450 + Math.random() * 450,
      });
    }

    // Dark background-fragment dust
    for (let i = 0; i < 35; i++) {
      const px = SNAP_MARGIN + Math.random() * rect.width;
      const py = SNAP_MARGIN + Math.random() * rect.height;
      const normalizedX = (px - SNAP_MARGIN) / rect.width;
      const gray = 55 + Math.floor(Math.random() * 75);

      particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.35) * 2.5,
        vy: (Math.random() - 0.55) * 2,
        size: 1 + Math.random() * 2.5,
        opacity: 0.2 + Math.random() * 0.3,
        color: `rgb(${gray}, ${Math.max(gray - 12, 35)}, ${Math.max(gray - 22, 25)})`,
        delay: (1 - normalizedX) * 200 + Math.random() * 80,
        life: 350 + Math.random() * 500,
      });
    }

    const startTime = performance.now();
    let animId: number;

    function animate(now: number) {
      const elapsed = now - startTime;
      ctx!.clearRect(0, 0, cw, ch);

      let anyAlive = false;

      for (const p of particles) {
        const age = elapsed - p.delay;
        if (age < 0) {
          anyAlive = true;
          continue;
        }

        const progress = age / p.life;
        if (progress >= 1) {
          continue;
        }

        anyAlive = true;

        const t = age * 0.055;
        const drawX = p.x + p.vx * t;
        const drawY = p.y + p.vy * t - 0.012 * t * t; // gentle upward float
        const currentOpacity = p.opacity * (1 - progress * progress);
        const currentSize = p.size * (1 - progress * 0.4);

        ctx!.globalAlpha = currentOpacity;
        ctx!.fillStyle = p.color;

        if (currentSize > 2) {
          // Tiny square fragments
          ctx!.fillRect(drawX - currentSize / 2, drawY - currentSize / 2, currentSize, currentSize);
        } else {
          // Dust dots
          ctx!.beginPath();
          ctx!.arc(drawX, drawY, currentSize / 2, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      ctx!.globalAlpha = 1;

      if (anyAlive && elapsed < 1200) {
        animId = requestAnimationFrame(animate);
      } else {
        onCompleteRef.current();
      }
    }

    animId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animId);
    // rect/severity are stable per effect instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed pointer-events-none"
      style={{
        left: rect.left - SNAP_MARGIN,
        top: rect.top - SNAP_MARGIN,
        width: rect.width + SNAP_MARGIN * 2,
        height: rect.height + SNAP_MARGIN * 2,
        zIndex: 101,
      }}
    />
  );
}

// ── Toast item ────────────────────────────────────────────────────────

function ToastItem({
  notification,
  onSnap,
}: {
  notification: TradingNotification;
  onSnap: (id: string, rect: DOMRect, severity: NotificationSeverity) => void;
}) {
  const rootRef = useRef<HTMLLIElement>(null);
  const [open, setOpen] = useState(true);
  const [hiding, setHiding] = useState(false);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && !hiding) {
        setHiding(true);
        const el = rootRef.current;
        if (el) {
          onSnap(notification.id, el.getBoundingClientRect(), notification.severity);
        } else {
          // Fallback if ref unavailable — just close normally
          setOpen(false);
        }
      }
    },
    [hiding, notification.id, notification.severity, onSnap],
  );

  return (
    <ToastPrimitive.Root
      ref={rootRef}
      open={open}
      duration={5000}
      onOpenChange={handleOpenChange}
      className={cn(
        "group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl",
        "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=closed]:fade-out-0",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
        "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform",
        "data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full",
        "bg-[rgba(15,12,8,0.92)] border-[var(--glass-border)]",
        SEVERITY_BORDER[notification.severity],
        hiding
          ? "!opacity-0 !blur-[2px] !scale-[0.97] transition-all duration-200 ease-out"
          : "transition-all",
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

// ── Toast container ───────────────────────────────────────────────────

export function ToastNotifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const toastsEnabled = useNotificationStore((s) => s.toastsEnabled);
  const [toasts, setToasts] = useState<TradingNotification[]>([]);
  const [snapEffects, setSnapEffects] = useState<SnapEffect[]>([]);
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

  const handleSnap = useCallback((id: string, rect: DOMRect, severity: NotificationSeverity) => {
    setSnapEffects((prev) => [...prev, { id, rect, severity }]);
  }, []);

  const handleSnapDone = useCallback((id: string) => {
    setSnapEffects((prev) => prev.filter((e) => e.id !== id));
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {toasts.slice(-3).map((t) => (
          <ToastItem key={t.id} notification={t} onSnap={handleSnap} />
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[380px] max-w-[calc(100vw-2rem)] outline-none" />
      </ToastPrimitive.Provider>

      {/* Particle effects rendered outside toast provider for correct layering */}
      {snapEffects.map((effect) => (
        <SnapParticles
          key={effect.id}
          rect={effect.rect}
          severity={effect.severity}
          onComplete={() => handleSnapDone(effect.id)}
        />
      ))}
    </>
  );
}
