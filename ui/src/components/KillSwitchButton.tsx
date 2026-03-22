import { useState } from "react";
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
            ? `Kill switch ON: ${killSwitchReason ?? "activated"}`
            : "Kill switch OFF — click to halt all trading"
        }
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-all",
          "border",
          killSwitchActive
            ? "bg-red-900/80 border-red-700 text-red-100 hover:bg-red-800 animate-pulse"
            : "bg-green-900/30 border-green-800/50 text-green-400 hover:bg-green-900/50",
        )}
      >
        <span
          className={cn("w-2 h-2 rounded-full", killSwitchActive ? "bg-red-400" : "bg-green-400")}
        />
        {killSwitchActive ? "KILL SWITCH: ACTIVE" : "TRADING: OK"}
      </button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {killSwitchActive ? "Resume Trading?" : "Activate Kill Switch?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {killSwitchActive
                ? "This will deactivate the kill switch and allow trading to resume. Make sure all risk conditions have been resolved before continuing."
                : "This will immediately halt ALL trading activity across every extension. No new orders will be accepted until the kill switch is deactivated."}
            </AlertDialogDescription>
            {killSwitchActive && killSwitchReason && (
              <div className="mt-2 rounded-md bg-red-950/50 border border-red-900 p-3 text-xs text-red-300">
                <span className="font-semibold">Reason: </span>
                {killSwitchReason}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                killSwitchActive
                  ? "bg-green-700 hover:bg-green-600 text-white"
                  : "bg-red-700 hover:bg-red-600 text-white",
              )}
            >
              {killSwitchActive ? "Resume Trading" : "Halt All Trading"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
