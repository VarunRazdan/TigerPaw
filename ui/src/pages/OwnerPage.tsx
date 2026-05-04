import { Check, Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataModeSelector } from "@/components/DataModeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { saveConfigPatch } from "@/lib/save-config";
import { cn } from "@/lib/utils";
import { notifyError } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";
import {
  cleanOwnerEntries,
  isPlausibleOwnerEntry,
  readOwnerEntriesFromConfig,
} from "./owner-page-helpers.js";

export function OwnerPage() {
  const { t } = useTranslation("owner");
  const demoMode = useTradingStore((s) => s.demoMode);

  const [entries, setEntries] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    if (demoMode) {
      // Demo mode: seed with a placeholder entry so the UI shows realistic content,
      // but block saving (handled in handleSave below).
      setEntries(["+85290263757"]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    gatewayRpc<{ raw?: string }>("config.get", {})
      .then((res) => {
        if (cancelled) {
          return;
        }
        if (res.ok && res.payload?.raw) {
          try {
            const cfg = JSON.parse(res.payload.raw) as unknown;
            setEntries(readOwnerEntriesFromConfig(cfg));
          } catch {
            // Malformed JSON — leave entries empty; the user can still add fresh ones.
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [demoMode]);

  function setEntry(index: number, value: string) {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setSavedHint(false);
  }

  function addEntry() {
    setEntries((prev) => [...prev, ""]);
    setSavedHint(false);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setSavedHint(false);
  }

  async function handleSave() {
    if (demoMode) {
      notifyError(
        t("saveError", "Couldn't save the owner allowlist"),
        new Error(t("demoSaveBlocked", "Saving is disabled in demo mode")),
      );
      return;
    }
    setSaving(true);
    setSavedHint(false);
    try {
      const cleaned = cleanOwnerEntries(entries);
      const patch = { commands: { ownerAllowFrom: cleaned } };
      const res = await saveConfigPatch(patch);
      if (res.ok) {
        // Reflect the cleaned (deduped, trimmed) list back into the form so
        // the user sees what was saved.
        setEntries(cleaned);
        setSavedHint(true);
      } else {
        notifyError(
          t("saveError", "Couldn't save the owner allowlist"),
          new Error(res.error ?? "Save failed"),
        );
      }
    } catch (err) {
      notifyError(
        t("saveError", "Couldn't save the owner allowlist"),
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-orange-400" />
            {t("title", "Owner allowlist")}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5 max-w-prose">
            {t(
              "subtitle",
              "Phone numbers (or channel-prefixed identifiers) that count as the bot's owner. Owner-gated chat commands like /allowlist only respond to senders on this list.",
            )}
          </p>
        </div>
        <DataModeSelector />
      </div>

      {/* Entries */}
      <div className="rounded-2xl glass-panel p-4 space-y-3">
        {entries.length === 0 ? (
          <div className="text-center py-6">
            <UserCheck className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
            <p className="text-sm text-neutral-300">{t("empty.title", "No owners configured")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-prose mx-auto">
              {t(
                "empty.body",
                "Add at least one number so owner-gated commands work. Without owners, /allowlist falls back to the broader sender check.",
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, idx) => {
              const trimmed = entry.trim();
              const showWarn = trimmed.length > 0 && !isPlausibleOwnerEntry(trimmed);
              return (
                <li
                  key={`owner-${idx}`}
                  className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-2.5"
                >
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <Input
                      type="text"
                      value={entry}
                      onChange={(e) => setEntry(idx, e.target.value)}
                      placeholder={t("placeholder", "+85290263757")}
                      disabled={demoMode}
                      className={cn(
                        "h-9 text-sm font-mono",
                        showWarn && "border-amber-700/60 focus-visible:ring-amber-500",
                      )}
                      aria-label={`${t("title", "Owner allowlist")} ${idx + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntry(idx)}
                      disabled={demoMode}
                      aria-label={t("removeOwner", "Remove")}
                      className="h-9 px-2 text-neutral-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {showWarn && (
                    <p className="text-[10px] text-amber-400/80 mt-1 ml-1">
                      {t(
                        "warn.notE164",
                        "Doesn't look like E.164 (e.g. +14155551234). Will still be saved — Tigerpaw matches against channel-native identifiers, so non-phone formats are valid for non-phone channels.",
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={addEntry}
            disabled={demoMode}
          >
            <Plus className="w-3 h-3 mr-1" />
            {t("addOwner", "Add owner")}
          </Button>
          <Button size="sm" className="text-xs" onClick={handleSave} disabled={saving || demoMode}>
            {saving ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : savedHint ? (
              <Check className="w-3 h-3 mr-1" />
            ) : (
              <UserCheck className="w-3 h-3 mr-1" />
            )}
            {savedHint ? t("savedHint", "Saved") : t("save", "Save")}
          </Button>
        </div>
      </div>

      {/* Format hint */}
      <div className="rounded-xl bg-[var(--glass-subtle)] border border-[var(--glass-border)] px-4 py-3">
        <p className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wide">
          {t("hint.title", "Format")}
        </p>
        <p className="text-xs text-neutral-400 mt-1 max-w-prose">
          {t(
            "hint.body",
            "Phone numbers should be E.164 format: + followed by country code and digits, no spaces. For non-phone channels, prefix with the channel id, e.g. telegram:@yourname.",
          )}
        </p>
        <p className="text-[11px] text-neutral-500 mt-2 max-w-prose">
          {t(
            "currentSenderHelp",
            "Tip: send any message to your bot, then return here — the sender ID for that message will appear in the next /allowlist reply, and you can paste it as an owner.",
          )}
        </p>
      </div>
    </div>
  );
}

export default OwnerPage;
