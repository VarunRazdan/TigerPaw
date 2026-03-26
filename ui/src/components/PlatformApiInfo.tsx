import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  "Session-based":
    "bg-[var(--glass-subtle-hover)] text-neutral-300 border-[var(--glass-subtle-hover)]",
  "Cosmos SDK": "bg-indigo-900 text-indigo-300 border-indigo-800",
};

export function PlatformApiInfo({ platforms }: PlatformApiInfoProps) {
  const { t } = useTranslation("trading");
  const { t: tc } = useTranslation("common");
  const [expanded, setExpanded] = useState(false);
  const { platformKillSwitches, togglePlatformKillSwitch } = useTradingStore();

  return (
    <div className="rounded-2xl glass-panel">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--glass-divider)] transition-colors cursor-pointer"
      >
        <h3 className="text-sm font-semibold text-neutral-300">{t("platformApiDetails")}</h3>
        <span className="text-xs text-neutral-500">
          {expanded ? t("hideDetails") : t("showDetails")}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-500 border-b border-[var(--glass-border)]">
                  <th className="text-left py-2 pr-3 font-medium">{tc("platform")}</th>
                  <th className="text-left py-2 pr-3 font-medium">{t("api")}</th>
                  <th className="text-left py-2 pr-3 font-medium">{t("authScheme")}</th>
                  <th className="text-left py-2 pr-3 font-medium">{t("method")}</th>
                  <th className="text-left py-2 pr-3 font-medium">{t("endpoint")}</th>
                  <th className="text-left py-2 pr-3 font-medium">{tc("sandbox")}</th>
                  <th className="text-left py-2 font-medium">{tc("status")}</th>
                </tr>
              </thead>
              <tbody>
                <TooltipProvider>
                  {Object.entries(platforms).map(([id, platform]) => (
                    <tr
                      key={id}
                      className={cn(
                        "border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-subtle)] transition-colors duration-200",
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
                                  "bg-[var(--glass-subtle-hover)] text-neutral-300 border-[var(--glass-subtle-hover)]",
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
                          <span className="text-green-400">{tc("yes")}</span>
                        ) : (
                          <span className="text-neutral-600">{tc("no")}</span>
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
                            {platformKillSwitches[id]?.active ? tc("halted") : tc("active")}
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
