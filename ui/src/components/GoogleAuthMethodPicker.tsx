import { KeyRound, Server } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AuthMethod = "oauth2" | "service_account";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  onSelect: (method: AuthMethod) => void;
};

const ICONS: Record<AuthMethod, React.ReactNode> = {
  oauth2: <KeyRound className="w-5 h-5" />,
  service_account: <Server className="w-5 h-5" />,
};

export function GoogleAuthMethodPicker({ open, onOpenChange, providerName, onSelect }: Props) {
  const { t } = useTranslation("integrations");
  const { t: tc } = useTranslation("common");
  const [selected, setSelected] = useState<AuthMethod>("oauth2");

  const options = useMemo(
    () => [
      {
        value: "oauth2" as AuthMethod,
        label: t("authPicker.oauth2.label"),
        description: t("authPicker.oauth2.description"),
      },
      {
        value: "service_account" as AuthMethod,
        label: t("authPicker.serviceAccount.label"),
        description: t("authPicker.serviceAccount.description"),
      },
    ],
    [t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("authPicker.title", { provider: providerName })}</DialogTitle>
          <DialogDescription>{t("authPicker.subtitle")}</DialogDescription>
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
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-neutral-700/50 bg-neutral-800/30 hover:border-neutral-600",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "shrink-0",
                    selected === opt.value ? "text-blue-400" : "text-neutral-500",
                  )}
                >
                  {ICONS[opt.value]}
                </span>
                <div>
                  <div className="text-sm font-medium text-neutral-200">{opt.label}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{opt.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => {
              onSelect(selected);
              onOpenChange(false);
            }}
          >
            {t("authPicker.continue")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
