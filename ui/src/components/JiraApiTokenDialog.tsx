import { Check, ExternalLink, KeyRound, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { cn } from "@/lib/utils";
import type { IntegrationConnection } from "@/stores/integration-store";
import { notifyError } from "@/stores/notification-store";

const TOKEN_GEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: (connection: IntegrationConnection) => void;
};

/**
 * Connect Jira via a long-lived Atlassian API token + email (Basic auth).
 *
 * Faster than OAuth — no Developer Console app registration, no consent
 * round-trip. The token is validated against the user's Jira site
 * (`/rest/api/3/myself`) before the connection is persisted.
 */
export function JiraApiTokenDialog({ open, onOpenChange, onConnected }: Props) {
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSiteUrl("");
    setEmail("");
    setApiToken("");
    setTokenVisible(false);
    setSaving(false);
    setSaved(false);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Defer reset so dialog close transition doesn't flash an empty form.
      window.setTimeout(reset, 200);
    }
    onOpenChange(next);
  }

  const canSave =
    siteUrl.trim().length > 0 && email.trim().length > 0 && apiToken.trim().length > 0;

  async function handleSave() {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await gatewayRpc<{ connection?: IntegrationConnection }>(
        "integrations.apiToken.connect",
        {
          providerId: "jira",
          siteUrl: siteUrl.trim(),
          email: email.trim(),
          apiToken: apiToken.trim(),
        },
      );
      if (res.ok && res.payload?.connection) {
        setSaved(true);
        onConnected?.(res.payload.connection);
        window.setTimeout(() => handleOpenChange(false), 600);
      } else {
        const msg = res.ok ? "Connect failed — no connection returned." : res.error;
        setError(msg ?? "Connect failed.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      notifyError("Jira connection failed", err instanceof Error ? err : new Error(msg));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neutral-100">
            <KeyRound className="w-5 h-5 text-orange-400" />
            Connect Jira with an API token
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            Faster than the OAuth flow. The token is checked against your Jira site before anything
            is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Steps */}
          <div className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3">
            <h4 className="text-xs font-semibold text-neutral-300 mb-2">Setup</h4>
            <ol className="text-[11px] text-neutral-400 space-y-1.5 list-decimal list-inside">
              <li>Open the Atlassian API tokens page (link below).</li>
              <li>
                Click <b>Create API token</b> with scopes; pick a label like "Tigerpaw" and grant
                Jira read + write scopes. (A classic, scope-less token works too.)
              </li>
              <li>Copy the token (you only see it once) and paste it below.</li>
              <li>
                Enter your Jira site URL (e.g.{" "}
                <code className="text-neutral-300">https://your-site.atlassian.net</code>) and the
                email of the Atlassian account you used.
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <a
                href={TOKEN_GEN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                id.atlassian.com → Security → API tokens
              </a>
              <a
                href="https://github.com/varunrazdan/tigerpaw/blob/main/docs/integrations/jira.md#api-token-setup-fast-path"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Detailed guide
              </a>
            </div>
          </div>

          {/* Site URL */}
          <div>
            <label htmlFor="jira-site-url" className="text-[11px] text-neutral-400 block mb-1">
              Jira site URL
            </label>
            <input
              id="jira-site-url"
              type="text"
              value={siteUrl}
              onChange={(e) => {
                setSiteUrl(e.target.value);
                setSaved(false);
                setError(null);
              }}
              placeholder="https://your-site.atlassian.net"
              autoComplete="off"
              className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="jira-email" className="text-[11px] text-neutral-400 block mb-1">
              Atlassian account email
            </label>
            <input
              id="jira-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSaved(false);
                setError(null);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Token */}
          <div>
            <label htmlFor="jira-api-token" className="text-[11px] text-neutral-400 block mb-1">
              API token
            </label>
            <div className="relative">
              <input
                id="jira-api-token"
                type={tokenVisible ? "text" : "password"}
                value={apiToken}
                onChange={(e) => {
                  setApiToken(e.target.value);
                  setSaved(false);
                  setError(null);
                }}
                placeholder="ATATT3xFfGF0..."
                autoComplete="off"
                spellCheck={false}
                className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 pr-16 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setTokenVisible(!tokenVisible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-300 px-1.5 py-0.5 rounded transition-colors"
              >
                {tokenVisible ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              {error}
            </div>
          ) : null}

          {/* Security note */}
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <Shield className="w-3 h-3 flex-shrink-0" />
            Stored encrypted on this machine. Revoke any time from id.atlassian.com.
          </p>

          {/* Save */}
          <Button
            className={cn("w-full text-sm", saved && "bg-green-700 hover:bg-green-600")}
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validating…
              </>
            ) : saved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Connected
              </>
            ) : (
              "Save & Connect"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
