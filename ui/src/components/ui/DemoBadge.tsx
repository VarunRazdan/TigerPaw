import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type DemoBadgeProps = {
  /** Custom message; defaults to a generic "demo data" warning. */
  message?: string;
  /**
   * "banner" → full-width amber callout for placement above demo grids.
   * "pill"   → inline compact tag for reuse near a header or stat.
   */
  variant?: "pill" | "banner";
  className?: string;
};

const DEFAULT_MESSAGE = "Demo data — not connected to live markets";

/**
 * Visible, non-dismissable indicator that the surrounding UI is rendering
 * hardcoded placeholder data (not live adapter output). Used on trading
 * platform pages when `platform.connected === false` so users don't
 * confuse demo order books / positions with real ones.
 */
export function DemoBadge({ message, variant = "banner", className }: DemoBadgeProps) {
  const text = message ?? DEFAULT_MESSAGE;
  if (variant === "pill") {
    return (
      <span
        role="note"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-300",
          className,
        )}
      >
        <AlertTriangle className="w-3 h-3" />
        {text}
      </span>
    );
  }
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300",
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}
