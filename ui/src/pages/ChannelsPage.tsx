export function ChannelsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">Channels</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Manage messaging channel integrations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { name: "Discord", status: "connected", icon: "💬" },
          { name: "Telegram", status: "connected", icon: "✈️" },
          { name: "Slack", status: "not configured", icon: "📱" },
          { name: "Signal", status: "not configured", icon: "🔒" },
          { name: "iMessage", status: "not configured", icon: "💭" },
          { name: "Matrix", status: "not configured", icon: "🌐" },
        ].map((channel) => (
          <div
            key={channel.name}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 flex items-center gap-3"
          >
            <span className="text-xl">{channel.icon}</span>
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-200">{channel.name}</div>
              <div className="text-xs text-neutral-500">{channel.status}</div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                channel.status === "connected" ? "bg-green-500" : "bg-neutral-700"
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
