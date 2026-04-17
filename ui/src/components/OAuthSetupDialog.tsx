import { Check, ExternalLink, KeyRound, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveConfigPatch } from "@/lib/save-config";
import { cn } from "@/lib/utils";
import { notifyError } from "@/stores/notification-store";

// ---------------------------------------------------------------------------
// OAuth group definitions
// ---------------------------------------------------------------------------

type OAuthGroup = "google" | "microsoft" | "zoom";

const OAUTH_GROUPS: Record<
  OAuthGroup,
  {
    label: string;
    consoleUrl: string;
    consoleName: string;
    unlocks: string[];
    steps: string[];
  }
> = {
  google: {
    label: "Google",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    consoleName: "Google Cloud Console",
    unlocks: ["Gmail", "Google Calendar", "Google Meet"],
    steps: [
      "Go to Google Cloud Console and create a project (or select existing)",
      "Enable Gmail API and Google Calendar API from the API Library",
      "Go to Credentials and click Create Credentials > OAuth Client ID",
      "Set Application type to Web Application",
      "Add the redirect URI shown below to Authorized redirect URIs",
      "Copy the Client ID and Client Secret into the fields below",
    ],
  },
  microsoft: {
    label: "Microsoft",
    consoleUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    consoleName: "Azure Portal",
    unlocks: ["Outlook Mail", "Outlook Calendar", "Microsoft Teams"],
    steps: [
      "Go to Azure Portal > App registrations > New registration",
      "Set Redirect URI to the value shown below (Web platform)",
      "Under Certificates & secrets, create a new Client Secret",
      "Under API permissions, add Microsoft Graph: Mail.ReadWrite, Calendars.ReadWrite",
      "Copy the Application (client) ID and Secret value below",
    ],
  },
  zoom: {
    label: "Zoom",
    consoleUrl: "https://marketplace.zoom.us/develop/create",
    consoleName: "Zoom App Marketplace",
    unlocks: ["Zoom Meetings"],
    steps: [
      "Go to Zoom App Marketplace > Develop > Build App",
      "Choose OAuth app type",
      "Add the redirect URI shown below",
      "Under Scopes, add meeting:read, meeting:write",
      "Copy the Client ID and Client Secret below",
    ],
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OAuthSetupDialog({
  open,
  onOpenChange,
  group,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: OAuthGroup;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("integrations");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);

  const config = OAUTH_GROUPS[group];
  const port = typeof window !== "undefined" ? window.location.port || "18789" : "18789";
  const redirectUri = `http://127.0.0.1:${port}/integrations/oauth2/callback`;

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0;

  async function handleSave() {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setSaved(false);

    try {
      const patch = {
        integrations: {
          oauth: {
            [group]: {
              clientId: clientId.trim(),
              clientSecret: clientSecret.trim(),
            },
          },
        },
      };

      const res = await saveConfigPatch(patch);
      if (res.ok) {
        setSaved(true);
        onSaved?.();
      } else {
        notifyError(
          t("setup.errorSave", "Failed to save credentials"),
          new Error(res.error ?? "Save failed"),
        );
      }
    } catch (err) {
      notifyError(
        t("setup.errorSave", "Failed to save credentials"),
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neutral-100">
            <KeyRound className="w-5 h-5 text-orange-400" />
            {t("setup.title", {
              provider: config.label,
              defaultValue: `Set up ${config.label} OAuth`,
            })}
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {t("setup.unlocks", {
              services: config.unlocks.join(", "),
              defaultValue: `Unlocks: ${config.unlocks.join(", ")}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Setup instructions */}
          <div className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3">
            <h4 className="text-xs font-semibold text-neutral-300 mb-2">
              {t("setup.instructions", "Setup Instructions")}
            </h4>
            <ol className="text-[11px] text-neutral-400 space-y-1.5 list-decimal list-inside">
              {config.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <a
              href={config.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 mt-2 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t("setup.consoleLink", {
                provider: config.consoleName,
                defaultValue: `Open ${config.consoleName}`,
              })}
            </a>
          </div>

          {/* Redirect URI */}
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">
              {t("setup.redirectUri", "Redirect URI (add this to your OAuth app)")}
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono text-neutral-300 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-md px-3 py-1.5 select-all">
                {redirectUri}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(redirectUri)}
                className="text-[10px] text-neutral-500 hover:text-neutral-300 px-2 py-1 rounded transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Client ID */}
          <div>
            <label htmlFor="oauth-client-id" className="text-[11px] text-neutral-400 block mb-1">
              {t("setup.clientId", "Client ID")}
            </label>
            <input
              id="oauth-client-id"
              type="text"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 123456789.apps.googleusercontent.com"
              className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Client Secret */}
          <div>
            <label
              htmlFor="oauth-client-secret"
              className="text-[11px] text-neutral-400 block mb-1"
            >
              {t("setup.clientSecret", "Client Secret")}
            </label>
            <div className="relative">
              <input
                id="oauth-client-secret"
                type={secretVisible ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => {
                  setClientSecret(e.target.value);
                  setSaved(false);
                }}
                placeholder="e.g. GOCSPX-..."
                className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 pr-16 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setSecretVisible(!secretVisible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-300 px-1.5 py-0.5 rounded transition-colors"
              >
                {secretVisible ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Security note */}
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <Shield className="w-3 h-3 flex-shrink-0" />
            {t(
              "setup.securityNote",
              "Credentials are stored locally and never sent to third parties.",
            )}
          </p>

          {/* Save button */}
          <Button
            className={cn("w-full text-sm", saved && "bg-green-700 hover:bg-green-600")}
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t("setup.saved", "Credentials saved")}
              </>
            ) : (
              t("setup.saveConnect", "Save & Connect")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Maps integration provider IDs to their OAuth credential group. */
export const PROVIDER_TO_OAUTH_GROUP: Record<string, OAuthGroup> = {
  gmail: "google",
  google_calendar: "google",
  google_meet: "google",
  outlook_mail: "microsoft",
  outlook_calendar: "microsoft",
  ms_teams_meetings: "microsoft",
  zoom: "zoom",
};
