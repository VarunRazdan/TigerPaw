import { KeyRound, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type JiraAuthMethod = "oauth2" | "api_token";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (method: JiraAuthMethod) => void;
};

const ICONS: Record<JiraAuthMethod, React.ReactNode> = {
  api_token: <Zap className="w-5 h-5" />,
  oauth2: <KeyRound className="w-5 h-5" />,
};

export function JiraAuthMethodPicker({ open, onOpenChange, onSelect }: Props) {
  // Default to API token — it's the faster path for a personal install and
  // most Tigerpaw users are connecting to their own Jira site, not a tenant
  // they need to grant per-user scopes for.
  const [selected, setSelected] = useState<JiraAuthMethod>("api_token");

  const options = useMemo(
    () => [
      {
        value: "api_token" as JiraAuthMethod,
        label: "API Token (Faster)",
        description:
          "Paste a token from id.atlassian.com. ~30-second setup; works for personal use.",
        badge: "Recommended",
      },
      {
        value: "oauth2" as JiraAuthMethod,
        label: "Sign in with Atlassian",
        description:
          "Browser-based OAuth consent flow. Requires a one-time OAuth app registration in the Atlassian Developer Console.",
        badge: null,
      },
    ],
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">Connect Jira</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Choose how Tigerpaw should authenticate with your Jira site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={cn(
                "w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer",
                selected === opt.value
                  ? "border-orange-500/60 bg-orange-500/10"
                  : "border-neutral-700/50 bg-neutral-800/30 hover:border-neutral-600",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "shrink-0",
                    selected === opt.value ? "text-orange-400" : "text-neutral-500",
                  )}
                >
                  {ICONS[opt.value]}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-neutral-200">{opt.label}</div>
                    {opt.badge ? (
                      <span className="text-[10px] uppercase tracking-wide bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded px-1.5 py-0.5">
                        {opt.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">{opt.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSelect(selected);
              onOpenChange(false);
            }}
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
