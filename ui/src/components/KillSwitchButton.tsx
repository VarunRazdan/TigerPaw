import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export function KillSwitchButton() {
  const { t } = useTranslation("trading");
  const { t: tc } = useTranslation("common");
  const { killSwitchActive, killSwitchReason, toggleKillSwitch } = useTradingStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleConfirm() {
    toggleKillSwitch();
    setDialogOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        title={
          killSwitchActive
            ? `${t("killSwitchOn")}: ${killSwitchReason ?? "activated"}`
            : t("killSwitchOff")
        }
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-all duration-300 cursor-pointer",
          "border",
          killSwitchActive
            ? "bg-red-900/80 border-red-700 text-red-100 hover:bg-red-800 hover:shadow-lg hover:shadow-red-900/40 animate-pulse"
            : "bg-green-900/30 border-green-800/50 text-green-400 hover:bg-green-900/50 hover:shadow-lg hover:shadow-green-900/30",
        )}
      >
        <span
          className={cn("w-2 h-2 rounded-full", killSwitchActive ? "bg-red-400" : "bg-green-400")}
        />
        {killSwitchActive ? t("killSwitchLabel") : t("tradingOk")}
      </button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {killSwitchActive ? t("resumeTrading") : t("activateKillSwitch")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {killSwitchActive ? t("resumeDesc") : t("activateDesc")}
            </AlertDialogDescription>
            {killSwitchActive && killSwitchReason && (
              <div className="mt-2 rounded-md bg-red-950/50 border border-red-900 p-3 text-xs text-red-300">
                <span className="font-semibold">{t("reason")}: </span>
                {killSwitchReason}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                killSwitchActive
                  ? "bg-green-700 hover:bg-green-600 text-white"
                  : "bg-red-700 hover:bg-red-600 text-white",
              )}
            >
              {killSwitchActive ? t("resumeButton") : t("haltButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
