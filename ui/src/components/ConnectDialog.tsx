import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectInfo } from "@/lib/connect-config";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { saveConfigPatch } from "@/lib/save-config";
import { assetUrl } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: ConnectInfo;
};

type SaveStatus = "idle" | "saving" | "saved" | "error" | "gateway-down";

export function ConnectDialog({ open, onOpenChange, info }: Props) {
  const { t } = useTranslation("connect");
  const { t: tc } = useTranslation("common");
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  function updateField(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  // For zero-credential channels (WhatsApp, iMessage), generate an enable-only patch
  const isZeroCred = info.credentials.length === 0;
  // WhatsApp-like channels use web.login.start for QR pairing
  const isWebLoginChannel =
    info.configSection === "whatsapp" || info.configSection === "bluebubbles";

  const configPatch = useMemo(() => {
    if (isZeroCred) {
      return { channels: { [info.configSection]: { enabled: true } } };
    }

    const obj: Record<string, string> = {};
    for (const cred of info.credentials) {
      const val = values[cred.field]?.trim();
      obj[cred.field] = val || (cred.envVar ? `\${${cred.envVar}}` : "");
    }

    if (info.configSection.startsWith("plugins.entries.")) {
      const pluginId = info.configSection.split(".")[2];
      return { plugins: { entries: { [pluginId]: { enabled: true, config: obj } } } };
    }
    return { [info.configSection]: obj };
  }, [values, info, isZeroCred]);

  const configSnippet = useMemo(
    () => (configPatch ? JSON.stringify(configPatch, null, 2) : null),
    [configPatch],
  );

  const hasAnyInput = Object.values(values).some((v) => v.trim());

  async function handleSaveToConfig() {
    if (!configPatch) {
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);

    const result = await saveConfigPatch(configPatch);

    if (result.ok) {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } else if (result.error === "Gateway not reachable" || result.error === "Request timed out") {
      setSaveStatus("gateway-down");
      setSaveError(t("gatewayDownHint"));
    } else {
      setSaveStatus("error");
      setSaveError(result.error);
    }
  }

  async function handleWebLogin() {
    setQrLoading(true);
    setQrDataUrl(null);
    setSaveError(null);

    // First ensure the channel is enabled
    if (configPatch) {
      const patchResult = await saveConfigPatch(configPatch);
      if (!patchResult.ok && patchResult.error !== "Gateway not reachable") {
        // Config patch failed but not because of restart — show error
        if (!patchResult.error?.includes("restart")) {
          setSaveError(patchResult.error);
        }
      }
    }

    // Wait a moment for config to be applied
    await new Promise((r) => setTimeout(r, 1000));

    // Trigger QR login via gateway RPC
    try {
      const result = await gatewayRpc<{ qrDataUrl?: string }>(
        "web.login.start",
        { timeoutMs: 60000 },
        { timeoutMs: 65000 },
      );
      if (result.ok && result.payload?.qrDataUrl) {
        setQrDataUrl(result.payload.qrDataUrl);
        setQrLoading(false);

        // Now wait for the user to scan (web.login.wait blocks until scan completes)
        const waitResult = await gatewayRpc<{ connected?: boolean; message?: string }>(
          "web.login.wait",
          { timeoutMs: 120000 },
          { timeoutMs: 125000 },
        );
        if (waitResult.ok && waitResult.payload?.connected) {
          setQrDataUrl(null);
          setSaveStatus("saved");
          setSaveError(null);
        } else {
          setSaveError(
            waitResult.ok
              ? (waitResult.payload?.message ?? "Scan timed out")
              : "error" in waitResult
                ? waitResult.error
                : "Pairing failed",
          );
        }
        return;
      } else if (!result.ok) {
        setSaveError("error" in result ? result.error : "Failed to start WhatsApp login");
      }
    } catch {
      setSaveError("Failed to connect to gateway for QR code");
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img src={assetUrl(info.iconPath)} alt="" className="w-8 h-8" />
            <div>
              <DialogTitle>{t("connectPlatform", { platform: info.name })}</DialogTitle>
              <DialogDescription>{info.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Setup Steps */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
            {t("setupSteps")}
          </h4>
          <ol className="space-y-1.5">
            {info.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-neutral-300">
                <span className="text-orange-500 font-mono text-xs mt-0.5 shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Credentials with input fields */}
        {info.credentials.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
              {t("credentials")}
            </h4>
            <div className="space-y-3">
              {info.credentials.map((cred) => (
                <div key={cred.field} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`cred-${cred.field}`}
                      className="text-sm font-medium text-neutral-200"
                    >
                      {cred.label}
                    </label>
                    {cred.envVar && (
                      <Badge
                        variant="outline"
                        className="text-[10px] cursor-pointer hover:bg-[var(--glass-subtle-hover)] transition-colors"
                        onClick={() => copyToClipboard(cred.envVar!, cred.envVar!)}
                      >
                        {copied === cred.envVar ? tc("copied") : `$${cred.envVar}`}
                      </Badge>
                    )}
                  </div>
                  <Input
                    id={`cred-${cred.field}`}
                    type={cred.sensitive === false ? "text" : "password"}
                    placeholder={cred.help}
                    value={values[cred.field] ?? ""}
                    onChange={(e) => updateField(cred.field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR Code display for web-login channels */}
        {qrDataUrl && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-xs text-neutral-400">
              Scan with WhatsApp &gt; Linked Devices &gt; Link a Device
            </p>
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              className="w-64 h-64 rounded-lg border border-[var(--glass-border)]"
            />
            <p className="text-[10px] text-neutral-600">
              QR expires in ~20 seconds. Click below to refresh.
            </p>
            <button
              type="button"
              onClick={handleWebLogin}
              className="text-xs text-orange-400 hover:text-orange-300 underline cursor-pointer"
            >
              Generate new QR code
            </button>
          </div>
        )}

        {/* Config snippet preview */}
        {configSnippet && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider hover:text-neutral-400 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span className="text-[8px]">{showPreview ? "\u25BC" : "\u25B6"}</span>
              {t("configPreview")}
            </button>
            {showPreview && (
              <pre className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-subtle)] p-3 text-xs text-neutral-400 overflow-x-auto font-mono whitespace-pre-wrap">
                {configSnippet}
              </pre>
            )}
          </div>
        )}

        {/* Save to Config / QR Login — primary action */}
        {configSnippet && (
          <div className="space-y-2">
            {isWebLoginChannel ? (
              <button
                type="button"
                disabled={qrLoading}
                onClick={handleWebLogin}
                className={`w-full text-center text-sm py-2.5 rounded-xl border transition-all duration-200 cursor-pointer font-medium ${
                  qrLoading
                    ? "bg-orange-900/10 border-orange-600/20 text-orange-400/50 cursor-wait"
                    : qrDataUrl
                      ? "bg-green-900/20 border-green-600/40 text-green-400 hover:bg-green-900/30"
                      : "bg-orange-900/20 border-orange-600/40 text-orange-400 hover:bg-orange-900/30 hover:border-orange-600/60 hover:shadow-md"
                }`}
              >
                {qrLoading
                  ? "Connecting..."
                  : qrDataUrl
                    ? "Refresh QR Code"
                    : "Connect & Show QR Code"}
              </button>
            ) : (
              <button
                type="button"
                disabled={saveStatus === "saving"}
                onClick={handleSaveToConfig}
                className={`w-full text-center text-sm py-2.5 rounded-xl border transition-all duration-200 cursor-pointer font-medium ${
                  saveStatus === "saved"
                    ? "bg-green-900/30 border-green-600/40 text-green-400"
                    : saveStatus === "saving"
                      ? "bg-orange-900/10 border-orange-600/20 text-orange-400/50 cursor-wait"
                      : hasAnyInput || isZeroCred
                        ? "bg-orange-900/20 border-orange-600/40 text-orange-400 hover:bg-orange-900/30 hover:border-orange-600/60 hover:shadow-md"
                        : "bg-orange-900/10 border-orange-600/30 text-orange-400/70 hover:bg-orange-900/20 hover:border-orange-600/50 hover:shadow-md"
                }`}
              >
                {saveStatus === "saving"
                  ? t("saving")
                  : saveStatus === "saved"
                    ? t("savedSuccess")
                    : isZeroCred
                      ? t("enable", { defaultValue: "Enable" })
                      : t("saveToConfig")}
              </button>
            )}

            {/* Error / gateway-down feedback */}
            {saveStatus === "error" && saveError && (
              <p className="text-xs text-red-400 text-center">{saveError}</p>
            )}
            {saveError && saveStatus !== "error" && (
              <p className="text-xs text-red-400 text-center">{saveError}</p>
            )}
            {saveStatus === "gateway-down" && (
              <div className="text-center space-y-1.5">
                <p className="text-xs text-amber-400">{t("gatewayDown")}</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(configSnippet, "config")}
                  className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2 cursor-pointer transition-colors"
                >
                  {copied === "config" ? tc("copied") : t("copyFallback")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sandbox badge */}
        {info.hasSandbox && (
          <div className="text-xs text-neutral-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            {t("sandboxAvailable", { mode: info.sandboxLabel })}
          </div>
        )}

        {/* Link to platform — hide for web-login channels since QR is inline */}
        {!isWebLoginChannel && (
          <a
            href={info.setupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-orange-400 hover:text-orange-300 transition-all duration-200 py-2.5 rounded-xl border border-[var(--glass-border)] hover:border-orange-600/40 hover:bg-[var(--glass-divider)] hover:shadow-md cursor-pointer"
          >
            {t("openSetupPage", { platform: info.name })}
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
