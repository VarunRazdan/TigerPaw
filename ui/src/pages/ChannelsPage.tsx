import { ChevronDown, ChevronUp, MessageSquare, Cpu, Bell } from "lucide-react";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ConnectDialog } from "@/components/ConnectDialog";
import { DataModeSelector } from "@/components/DataModeSelector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CHANNEL_CONNECT_INFO } from "@/lib/connect-config";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { useAppStore } from "@/stores/app-store";
import { useTradingStore } from "@/stores/trading-store";

const CHANNELS = [
  { name: "Discord", status: "connected", icon: "discord" },
  { name: "Telegram", status: "connected", icon: "telegram" },
  { name: "Slack", status: "connected", icon: "slack" },
  { name: "Signal", status: "connected", icon: "signal" },
  { name: "iMessage", status: "not configured", icon: "imessage" },
  { name: "WhatsApp", status: "connected", icon: "whatsapp" },
  { name: "Matrix", status: "not configured", icon: "matrix" },
  { name: "MS Teams", status: "not configured", icon: "ms-teams" },
  { name: "IRC", status: "not configured", icon: "irc" },
  { name: "Line", status: "not configured", icon: "line" },
  { name: "Nostr", status: "not configured", icon: "nostr" },
  { name: "Google Chat", status: "not configured", icon: "google-chat" },
  { name: "Mattermost", status: "not configured", icon: "mattermost" },
  { name: "Twitch", status: "not configured", icon: "twitch" },
  { name: "Feishu", status: "not configured", icon: "feishu" },
  { name: "Zalo", status: "not configured", icon: "zalo" },
  { name: "Tlon", status: "not configured", icon: "tlon" },
  { name: "Synology Chat", status: "not configured", icon: "synology-chat" },
  { name: "Nextcloud Talk", status: "not configured", icon: "nextcloud-talk" },
  { name: "Lobster", status: "not configured", icon: "lobster" },
  { name: "BlueBubbles", status: "not configured", icon: "bluebubbles" },
];

const CHANNELS_DEFAULT = CHANNELS.map((ch) => ({ ...ch, status: "not configured" }));

export function ChannelsPage() {
  const { t } = useTranslation("channels");
  const { t: tc } = useTranslation("common");
  const demoMode = useTradingStore((s) => s.demoMode);
  const liveStatuses = useAppStore((s) => s.channelStatuses);
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});
  const [connectIcon, setConnectIcon] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const connectInfo = connectIcon ? CHANNEL_CONNECT_INFO[connectIcon] : null;

  // Derive channels from live data + local disconnect overrides + demo fallback
  const channels = useMemo(() => {
    const liveMap = liveStatuses ? new Map(liveStatuses.map((s) => [s.id, s])) : null;
    // In live mode without gateway data, show all as "not configured"
    // In demo mode without gateway data, show hardcoded demo statuses
    const baseChannels = !liveMap && !demoMode ? CHANNELS_DEFAULT : CHANNELS;
    return baseChannels.map((ch) => {
      if (localOverrides[ch.icon]) {
        return { ...ch, status: localOverrides[ch.icon] };
      }
      if (!liveMap) {
        return ch;
      }
      const live = liveMap.get(ch.icon);
      if (!live) {
        return ch;
      }
      return {
        ...ch,
        status: live.connected ? "connected" : live.enabled ? "disconnected" : "not configured",
      };
    });
  }, [liveStatuses, localOverrides, demoMode]);

  const disconnectingChannel = disconnecting
    ? channels.find((ch) => ch.name === disconnecting)
    : null;

  async function handleDisconnectConfirm() {
    if (!disconnectingChannel) {
      return;
    }
    await gatewayRpc("config.patch", {
      patch: { channels: { [disconnectingChannel.icon]: { enabled: false } } },
    });
    setLocalOverrides((prev) => ({ ...prev, [disconnectingChannel.icon]: "disconnected" }));
    setDisconnecting(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("title")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <DataModeSelector />
      </div>

      {/* How it works explainer */}
      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHowItWorks((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-neutral-400 hover:text-neutral-300 transition-colors"
        >
          {t("howItWorks")}
          {showHowItWorks ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
        {showHowItWorks && (
          <div className="px-4 pb-4 space-y-3 border-t border-neutral-800/40">
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">{t("howItWorksBody")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                <span className="text-[11px] text-neutral-500">{t("howItWorksBullet1")}</span>
              </div>
              <div className="flex items-start gap-2">
                <Cpu className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                <span className="text-[11px] text-neutral-500">{t("howItWorksBullet2")}</span>
              </div>
              <div className="flex items-start gap-2">
                <Bell className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                <span className="text-[11px] text-neutral-500">{t("howItWorksBullet3")}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((channel) => (
            <Tooltip key={channel.name}>
              <TooltipTrigger asChild>
                <div
                  onClick={() => {
                    if (channel.status === "connected") {
                      setDisconnecting(channel.name);
                    } else if (CHANNEL_CONNECT_INFO[channel.icon]) {
                      setConnectIcon(channel.icon);
                    }
                  }}
                  className="relative rounded-2xl glass-panel-interactive p-4 flex items-center gap-3 cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <img
                    src={`/icons/messaging-channels/${channel.icon}.svg`}
                    alt={channel.name}
                    className="w-6 h-6"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-neutral-200">{channel.name}</div>
                    <div className="text-xs text-neutral-500">
                      {channel.status === "connected" ? (
                        channel.status
                      ) : CHANNEL_CONNECT_INFO[channel.icon] ? (
                        <span className="text-orange-400/70">{tc("clickToConnect")}</span>
                      ) : (
                        channel.status
                      )}
                    </div>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300 ${
                      channel.status === "connected"
                        ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                        : "bg-neutral-600"
                    }`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-semibold">{channel.name}</div>
                  <div className="text-neutral-400 capitalize">{channel.status}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {connectInfo && (
        <ConnectDialog
          open={connectIcon !== null}
          onOpenChange={(open) => !open && setConnectIcon(null)}
          info={connectInfo}
        />
      )}

      <AlertDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("disconnectTitle", {
                channel: disconnecting,
                defaultValue: `Disconnect ${disconnecting}?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("disconnectDescription", {
                defaultValue:
                  "This will stop all message routing for this channel. You can reconnect later.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnectConfirm}>
              {t("confirmDisconnect", { defaultValue: "Confirm" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
