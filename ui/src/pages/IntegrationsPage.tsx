import { ExternalLink, Mail, Calendar, Video, Power, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useIntegrationStore } from "@/stores/integration-store";
import type { IntegrationProvider } from "@/stores/integration-store";

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; description: string }> =
  {
    email: {
      label: "Email",
      icon: <Mail className="w-4 h-4" />,
      description: "Connect email accounts to read, send, search, and organize messages",
    },
    calendar: {
      label: "Calendar",
      icon: <Calendar className="w-4 h-4" />,
      description: "Connect calendars to create events, check availability, and manage schedules",
    },
    meeting: {
      label: "Meetings",
      icon: <Video className="w-4 h-4" />,
      description: "Connect meeting platforms to schedule calls and retrieve join links",
    },
  };

const CATEGORY_ORDER: string[] = ["email", "calendar", "meeting"];

function IntegrationIcon({ icon }: { icon: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Fallback to category-based lucide icon
    if (icon === "gmail" || icon === "outlook") {
      return <Mail className="w-6 h-6 text-neutral-400" />;
    }
    if (icon.includes("calendar")) {
      return <Calendar className="w-6 h-6 text-neutral-400" />;
    }
    return <Video className="w-6 h-6 text-neutral-400" />;
  }

  return (
    <img
      src={`/icons/integrations/${icon}.svg`}
      alt=""
      className="w-6 h-6"
      onError={() => setFailed(true)}
    />
  );
}

export function IntegrationsPage() {
  const { t } = useTranslation("integrations");
  const { t: tc } = useTranslation("common");
  const providers = useIntegrationStore((s) => s.providers);
  const connections = useIntegrationStore((s) => s.connections);
  const demoMode = useIntegrationStore((s) => s.demoMode);
  const fetchConnections = useIntegrationStore((s) => s.fetchConnections);
  const fetchProviders = useIntegrationStore((s) => s.fetchProviders);
  const startOAuth = useIntegrationStore((s) => s.startOAuth);
  const disconnect = useIntegrationStore((s) => s.disconnect);
  const connectingProvider = useIntegrationStore((s) => s.connectingProvider);
  const setConnectingProvider = useIntegrationStore((s) => s.setConnectingProvider);

  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    void fetchProviders();
    void fetchConnections();
  }, [fetchProviders, fetchConnections]);

  // Group providers by category
  const grouped = useMemo(() => {
    const map = new Map<string, IntegrationProvider[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const p of providers) {
      const list = map.get(p.category);
      if (list) {
        list.push(p);
      }
    }
    return map;
  }, [providers]);

  function getConnectionForProvider(providerId: string) {
    return connections.find((c) => c.providerId === providerId);
  }

  async function handleConnect(provider: IntegrationProvider) {
    const result = await startOAuth(provider.id);
    if (result) {
      // Open OAuth URL in popup
      const popup = window.open(
        result.authUrl,
        "tigerpaw-oauth",
        "width=600,height=700,menubar=no,toolbar=no",
      );

      // Poll for popup close
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          setConnectingProvider(null);
          void fetchConnections();
        }
      }, 500);
    }
  }

  async function handleDisconnectConfirm() {
    if (!disconnecting) {
      return;
    }
    await disconnect(disconnecting);
    setDisconnecting(null);
  }

  const disconnectingConn = disconnecting ? connections.find((c) => c.id === disconnecting) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">{t("title", "Integrations")}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {t("subtitle", "Connect email, calendar, and meeting services")}
        </p>
        {demoMode && (
          <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
            {tc("demoData")}
          </span>
        )}
      </div>

      <TooltipProvider>
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const categoryProviders = grouped.get(category) ?? [];
          if (categoryProviders.length === 0) {
            return null;
          }

          return (
            <div key={category} className="space-y-3">
              {/* Category header */}
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">{meta.icon}</span>
                <h2 className="text-sm font-semibold text-neutral-200">
                  {t(`categories.${category}`, meta.label)}
                </h2>
                <span className="text-xs text-neutral-600 hidden sm:inline">
                  {t(`categoryDesc.${category}`, meta.description)}
                </span>
              </div>

              {/* Provider cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryProviders.map((provider) => {
                  const conn = getConnectionForProvider(provider.id);
                  const isConnected = conn?.status === "connected";
                  const isExpired = conn?.status === "expired";
                  const isConnecting = connectingProvider === provider.id;

                  return (
                    <Tooltip key={provider.id}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => {
                            if (!isConnected && !isConnecting) {
                              void handleConnect(provider);
                            }
                          }}
                          className="relative rounded-2xl glass-panel-interactive p-4 flex items-center gap-3 cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 transition-all duration-300"
                        >
                          <IntegrationIcon icon={provider.icon} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-neutral-200">
                              {t(`providers.${provider.id}.name`, provider.name)}
                            </div>
                            <div className="text-xs text-neutral-500 truncate">
                              {isConnecting ? (
                                <span className="text-amber-400/70 flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  {t("oauthPending", "Waiting for authorization...")}
                                </span>
                              ) : isConnected ? (
                                <span className="text-neutral-400">
                                  {conn.accountEmail ?? conn.label}
                                </span>
                              ) : isExpired ? (
                                <span className="text-orange-400/70">
                                  {t("expired", "Token expired — click to reconnect")}
                                </span>
                              ) : (
                                <span className="text-orange-400/70">{tc("clickToConnect")}</span>
                              )}
                            </div>
                          </div>

                          {/* Status dot */}
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-300 ${
                              isConnected
                                ? "bg-green-500"
                                : isExpired
                                  ? "bg-amber-500"
                                  : "bg-white/[0.1]"
                            }`}
                          />

                          {/* Disconnect button */}
                          {isConnected && conn && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDisconnecting(conn.id);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-white/5 transition-colors duration-200"
                              aria-label={`Disconnect ${provider.name}`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs max-w-[240px]">
                          <div className="font-semibold">{provider.name}</div>
                          <div className="text-neutral-400">
                            {t(`providers.${provider.id}.description`, provider.description)}
                          </div>
                          {isConnected && conn?.lastUsedAt && (
                            <div className="text-neutral-500 mt-1">
                              {t("lastUsed", "Last used")}:{" "}
                              {new Date(conn.lastUsedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </TooltipProvider>

      {/* OAuth setup hint */}
      <div className="rounded-xl glass-panel p-4 text-xs text-neutral-500 flex items-start gap-2">
        <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div>
          <span className="text-neutral-400 font-medium">{t("oauthHintTitle", "OAuth Setup")}</span>
          {" — "}
          {t(
            "oauthHintBody",
            "Integrations use OAuth2 for secure access. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in your environment to enable connections.",
          )}
        </div>
      </div>

      {/* Disconnect confirmation dialog */}
      <AlertDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("disconnectTitle", {
                provider: disconnectingConn?.label ?? "",
                defaultValue: `Disconnect ${disconnectingConn?.label}?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "disconnectDescription",
                "This will revoke access and remove stored tokens. You can reconnect later.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnectConfirm}>{tc("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
