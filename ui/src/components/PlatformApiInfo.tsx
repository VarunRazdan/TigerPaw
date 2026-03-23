import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PlatformStatus } from "@/stores/trading-store";
import { useTradingStore } from "@/stores/trading-store";
import { PlatformIcon } from "./PlatformIcon";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type PlatformApiInfoProps = {
  platforms: Record<string, PlatformStatus>;
};

const AUTH_SCHEME_COLORS: Record<string, string> = {
  "HMAC-SHA256": "bg-emerald-900 text-emerald-300 border-emerald-800",
  "HMAC-SHA512": "bg-emerald-900 text-emerald-300 border-emerald-800",
  "RSA-SHA256": "bg-blue-900 text-blue-300 border-blue-800",
  "API Key Headers": "bg-amber-900 text-amber-300 border-amber-800",
  "API Key Bearer": "bg-amber-900 text-amber-300 border-amber-800",
  "Bearer JWT": "bg-purple-900 text-purple-300 border-purple-800",
  "ES256 JWT (CDP Key)": "bg-purple-900 text-purple-300 border-purple-800",
  "Session-based": "bg-white/[0.06] text-neutral-300 border-white/[0.08]",
  "Cosmos SDK": "bg-indigo-900 text-indigo-300 border-indigo-800",
};

export function PlatformApiInfo({ platforms }: PlatformApiInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const { platformKillSwitches, togglePlatformKillSwitch } = useTradingStore();

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg shadow-black/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
      >
        <h3 className="text-sm font-semibold text-neutral-300">Platform API Details</h3>
        <span className="text-xs text-neutral-500">{expanded ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-500 border-b border-white/[0.08]">
                  <th className="text-left py-2 pr-3 font-medium">Platform</th>
                  <th className="text-left py-2 pr-3 font-medium">API</th>
                  <th className="text-left py-2 pr-3 font-medium">Auth Scheme</th>
                  <th className="text-left py-2 pr-3 font-medium">Method</th>
                  <th className="text-left py-2 pr-3 font-medium">Endpoint</th>
                  <th className="text-left py-2 pr-3 font-medium">Sandbox</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <TooltipProvider>
                  {Object.entries(platforms).map(([id, platform]) => (
                    <tr
                      key={id}
                      className={cn(
                        "border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors duration-200",
                        !platform.connected && "opacity-50",
                      )}
                    >
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platformId={id} className="w-4 h-4" />
                          <span className="text-neutral-200 font-medium">{platform.label}</span>
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              platform.connected ? "bg-green-400" : "bg-neutral-600",
                            )}
                          />
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {platform.api.apiVersion}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border cursor-default",
                                AUTH_SCHEME_COLORS[platform.api.authScheme] ??
                                  "bg-white/[0.06] text-neutral-300 border-white/[0.08]",
                              )}
                            >
                              {platform.api.authScheme}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              {platform.api.authScheme === "HMAC-SHA256" &&
                                "Requests signed with HMAC-SHA256 — secrets never sent as headers"}
                              {platform.api.authScheme === "HMAC-SHA512" &&
                                "Requests signed with HMAC-SHA512 using API secret"}
                              {platform.api.authScheme === "RSA-SHA256" &&
                                "Requests signed with RSA-SHA256 using PEM private key"}
                              {platform.api.authScheme === "API Key Headers" &&
                                "API key and secret sent as HTTP headers"}
                              {platform.api.authScheme === "API Key Bearer" &&
                                "API key sent as Bearer token in Authorization header"}
                              {platform.api.authScheme === "Bearer JWT" &&
                                "JWT token in Authorization header"}
                              {platform.api.authScheme === "ES256 JWT (CDP Key)" &&
                                "ES256-signed JWT using Coinbase Developer Platform key"}
                              {platform.api.authScheme === "Session-based" &&
                                "Session cookie from gateway login"}
                              {platform.api.authScheme === "Cosmos SDK" &&
                                "Cosmos SDK transaction signing (on-chain)"}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="py-2 pr-3 text-neutral-400">
                        {platform.api.connectionMethod}
                      </td>
                      <td className="py-2 pr-3 font-mono text-neutral-500">
                        {platform.api.baseUrl}
                      </td>
                      <td className="py-2 pr-3">
                        {platform.api.hasSandbox ? (
                          <span className="text-green-400">Yes</span>
                        ) : (
                          <span className="text-neutral-600">No</span>
                        )}
                      </td>
                      <td className="py-2">
                        {platform.connected ? (
                          <button
                            onClick={() => togglePlatformKillSwitch(id)}
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded font-medium transition-colors cursor-pointer",
                              platformKillSwitches[id]?.active
                                ? "bg-red-900/80 text-red-300 hover:bg-red-800"
                                : "bg-green-900/30 text-green-400 hover:bg-green-900/50",
                            )}
                          >
                            {platformKillSwitches[id]?.active ? "Halted" : "Active"}
                          </button>
                        ) : (
                          <span className="text-neutral-600 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </TooltipProvider>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
