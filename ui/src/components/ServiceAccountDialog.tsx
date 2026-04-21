import { AlertCircle, Check, Clipboard, Loader2, Shield } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { notifyError } from "@/stores/notification-store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  providerName: string;
  scopes?: string[];
  onConnected: () => void;
};

function validateJsonShape(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type !== "service_account") {
      return `Expected type "service_account", got "${String(parsed.type)}"`;
    }
    if (!parsed.client_email) {
      return "Missing client_email field";
    }
    if (!parsed.private_key) {
      return "Missing private_key field";
    }
    return null;
  } catch {
    return "Invalid JSON";
  }
}

export function ServiceAccountDialog({
  open,
  onOpenChange,
  providerId,
  providerName,
  scopes,
  onConnected,
}: Props) {
  const { t } = useTranslation("integrations");
  const { t: tc } = useTranslation("common");
  const [json, setJson] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleJsonChange = useCallback((value: string) => {
    setJson(value);
    if (value.trim()) {
      setJsonError(validateJsonShape(value));
    } else {
      setJsonError(null);
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      handleJsonChange(text);
    } catch {
      // clipboard API not available
    }
  }, [handleJsonChange]);

  const canSubmit = json.trim() && email.trim() && !jsonError && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await gatewayRpc<{ connection?: unknown }>(
        "integrations.serviceAccount.connect",
        {
          providerId,
          serviceAccountJson: json,
          impersonateEmail: email,
        },
      );
      if (result.ok && result.payload?.connection) {
        onConnected();
        onOpenChange(false);
        setJson("");
        setEmail("");
      } else {
        const errorMsg = !result.ok ? result.error : "Connection failed";
        notifyError("Service Account", errorMsg);
      }
    } catch (err) {
      notifyError("Service Account", err instanceof Error ? err.message : "Connection failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sa.title", { provider: providerName })}</DialogTitle>
          <DialogDescription>{t("sa.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* JSON key textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-300">{t("sa.jsonLabel")}</label>
              <button
                type="button"
                onClick={handlePaste}
                className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Clipboard className="w-3 h-3" />
                {t("sa.pasteClipboard")}
              </button>
            </div>
            <textarea
              value={json}
              onChange={(e) => handleJsonChange(e.target.value)}
              placeholder='{"type": "service_account", "client_email": "...", ...}'
              rows={6}
              className="w-full rounded-lg border border-neutral-700/50 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-200 font-mono placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
            />
            {jsonError && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-400">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {jsonError}
              </div>
            )}
            {json.trim() && !jsonError && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-400">
                <Check className="w-3 h-3 shrink-0" />
                {t("sa.jsonValid")}
              </div>
            )}
          </div>

          {/* Impersonation email */}
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5">
              {t("sa.emailLabel")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@yourworkspace.com"
              className="w-full rounded-lg border border-neutral-700/50 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
            <p className="text-xs text-neutral-600 mt-1">{t("sa.emailHint")}</p>
          </div>

          {/* Scopes */}
          {scopes && scopes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                {t("sa.scopesLabel")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {scopes.map((scope) => {
                  const short = scope.split("/").pop() ?? scope;
                  return (
                    <code
                      key={scope}
                      title={scope}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800/60 border border-neutral-700/40 text-neutral-400"
                    >
                      {short}
                    </code>
                  );
                })}
              </div>
              <p className="text-xs text-neutral-600 mt-1">{t("sa.scopesHint")}</p>
            </div>
          )}

          {/* Security note */}
          <div className="flex items-start gap-2 rounded-lg bg-neutral-800/40 border border-neutral-700/30 p-3">
            <Shield className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-500">{t("sa.securityNote")}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                {t("sa.connecting")}
              </>
            ) : (
              t("sa.connect")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
