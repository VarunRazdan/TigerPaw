import { Mail, Calendar, Video, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataModeSelector } from "@/components/DataModeSelector";
import { GoogleAuthMethodPicker } from "@/components/GoogleAuthMethodPicker";
import { OAuthSetupDialog, PROVIDER_TO_OAUTH_GROUP } from "@/components/OAuthSetupDialog";
import { ServiceAccountDialog } from "@/components/ServiceAccountDialog";
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
import { gatewayRpc } from "@/lib/gateway-rpc";
import { assetUrl } from "@/lib/utils";
import { useIntegrationStore } from "@/stores/integration-store";
import type { IntegrationProvider } from "@/stores/integration-store";
import { useNotificationStore } from "@/stores/notification-store";

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

/** Google providers that support both OAuth2 and Service Account auth. */
const GOOGLE_SA_PROVIDERS = new Set(["gmail", "google_calendar", "google_meet", "google_sheets"]);

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
      src={assetUrl(`icons/integrations/${icon}.svg`)}
      alt=""
      className="w-6 h-6 invert brightness-[0.85]"
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
  const [setupGroup, setSetupGroup] = useState<"google" | "microsoft" | "zoom" | null>(null);
  const [pendingProvider, setPendingProvider] = useState<IntegrationProvider | null>(null);
  const [authPickerProvider, setAuthPickerProvider] = useState<IntegrationProvider | null>(null);
  const [saDialogProvider, setSaDialogProvider] = useState<IntegrationProvider | null>(null);
  const [oauthStatus, setOauthStatus] = useState<
    Record<string, { configured: boolean; source: "config" | "env" | null }>
  >({});

  const fetchOAuthStatus = useCallback(async () => {
    try {
      const res = await gatewayRpc<{
        status: Record<string, { configured: boolean; source: string | null }>;
      }>("integrations.oauth.status", {});
      if (res.ok && res.payload?.status) {
        setOauthStatus(res.payload.status as typeof oauthStatus);
      }
    } catch {
      // Gateway offline
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
    void fetchConnections();
    if (!demoMode) {
      void fetchOAuthStatus();
    }
  }, [fetchProviders, fetchConnections, fetchOAuthStatus, demoMode]);

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

  function startOAuthFlow(provider: IntegrationProvider) {
    // Check if OAuth credentials are configured for this provider's group
    const group = PROVIDER_TO_OAUTH_GROUP[provider.id];
    if (group && !oauthStatus[group]?.configured) {
      setPendingProvider(provider);
      setSetupGroup(group);
      return;
    }
    void doOAuthPopup(provider);
  }

  async function doOAuthPopup(provider: IntegrationProvider) {
    const result = await startOAuth(provider.id);
    if (result && "authUrl" in result) {
      const popup = window.open(
        result.authUrl,
        "tigerpaw-oauth",
        "width=600,height=700,menubar=no,toolbar=no",
      );
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          setConnectingProvider(null);
          void fetchConnections();
        }
      }, 500);
    } else {
      const errorMsg =
        result && "error" in result ? result.error : t("oauthError", "Authorization failed");
      useNotificationStore.getState().addNotification({
        type: "integration",
        title: t("providers." + provider.id + ".name", provider.name),
        description: errorMsg,
        severity: "error",
        timestamp: Date.now(),
      });
    }
  }

  async function handleConnect(provider: IntegrationProvider) {
    if (demoMode) {
      useNotificationStore.getState().addNotification({
        type: "integration",
        title: t("providers." + provider.id + ".name", provider.name),
        description: "Start the gateway to connect integrations.",
        severity: "warning",
        timestamp: Date.now(),
      });
      return;
    }

    // Google providers get a method picker (OAuth2 vs Service Account)
    if (GOOGLE_SA_PROVIDERS.has(provider.id)) {
      setAuthPickerProvider(provider);
      return;
    }

    startOAuthFlow(provider);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("title", "Integrations")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t("subtitle", "Connect email, calendar, and meeting services")}
          </p>
        </div>
        <DataModeSelector />
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
                            if (isConnected && conn) {
                              setDisconnecting(conn.id);
                            } else if (!isConnecting) {
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
                                <span className="text-neutral-400 flex items-center gap-1.5">
                                  {conn.accountEmail ?? conn.label}
                                  {conn.authMethod === "service_account" && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400/80 border border-blue-500/20 shrink-0">
                                      {t("authMethod.service_account")}
                                    </span>
                                  )}
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
                            className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300 ${
                              isConnected
                                ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                                : isExpired
                                  ? "bg-amber-500"
                                  : "bg-neutral-600"
                            }`}
                          />
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

      {/* Google auth method picker (OAuth2 vs Service Account) */}
      {authPickerProvider && (
        <GoogleAuthMethodPicker
          open={!!authPickerProvider}
          onOpenChange={(open) => {
            if (!open) {
              setAuthPickerProvider(null);
            }
          }}
          providerName={authPickerProvider.name}
          onSelect={(method) => {
            const provider = authPickerProvider;
            setAuthPickerProvider(null);
            if (method === "service_account") {
              setSaDialogProvider(provider);
            } else {
              startOAuthFlow(provider);
            }
          }}
        />
      )}

      {/* Service Account setup dialog */}
      {saDialogProvider && (
        <ServiceAccountDialog
          open={!!saDialogProvider}
          onOpenChange={(open) => {
            if (!open) {
              setSaDialogProvider(null);
            }
          }}
          providerId={saDialogProvider.id}
          providerName={saDialogProvider.name}
          scopes={saDialogProvider.oauth2Config?.scopes}
          onConnected={() => {
            setSaDialogProvider(null);
            void fetchConnections();
          }}
        />
      )}

      {/* OAuth credential setup dialog */}
      {setupGroup && (
        <OAuthSetupDialog
          open={!!setupGroup}
          onOpenChange={(open) => {
            if (!open) {
              setSetupGroup(null);
              setPendingProvider(null);
            }
          }}
          group={setupGroup}
          onSaved={() => {
            setSetupGroup(null);
            void fetchOAuthStatus();
            if (pendingProvider) {
              const provider = pendingProvider;
              setPendingProvider(null);
              setTimeout(() => void handleConnect(provider), 300);
            }
          }}
        />
      )}
    </div>
  );
}
