import { useState } from "react";
import { ConnectDialog } from "@/components/ConnectDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CHANNEL_CONNECT_INFO } from "@/lib/connect-config";

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

export function ChannelsPage() {
  const [connectIcon, setConnectIcon] = useState<string | null>(null);
  const connectInfo = connectIcon ? CHANNEL_CONNECT_INFO[connectIcon] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">Channels</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Manage messaging channel integrations</p>
      </div>

      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CHANNELS.map((channel) => (
            <Tooltip key={channel.name}>
              <TooltipTrigger asChild>
                <div
                  onClick={() => {
                    if (channel.status !== "connected" && CHANNEL_CONNECT_INFO[channel.icon]) {
                      setConnectIcon(channel.icon);
                    }
                  }}
                  className="rounded-2xl glass-panel-interactive p-4 flex items-center gap-3 cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 transition-all duration-300"
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
                        <span className="text-orange-400/70">Click to connect</span>
                      ) : (
                        channel.status
                      )}
                    </div>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                      channel.status === "connected" ? "bg-green-500" : "bg-white/[0.1]"
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
    </div>
  );
}
