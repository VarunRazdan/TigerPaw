import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTradingStore } from "@/stores/trading-store";

type AuditFinding = {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
};

const SEVERITY_STYLES: Record<
  string,
  { bg: string; border: string; badge: string; badgeText: string }
> = {
  critical: {
    bg: "bg-red-950/30",
    border: "border-red-800",
    badge: "bg-red-900",
    badgeText: "text-red-300",
  },
  warn: {
    bg: "bg-amber-950/20",
    border: "border-amber-800/50",
    badge: "bg-amber-900",
    badgeText: "text-amber-300",
  },
  info: {
    bg: "bg-[var(--glass-subtle)]",
    border: "border-[var(--glass-subtle-hover)]",
    badge:
      "bg-[var(--glass-subtle-hover)] hover:bg-[var(--glass-border)] transition-colors duration-200",
    badgeText: "text-neutral-400 hover:text-neutral-300",
  },
};

/** Known permissions per trading platform (declarative, from extension manifests). */
const PLATFORM_PERMISSIONS: Record<string, { network: string[]; secrets: number }> = {
  alpaca: { network: ["api.alpaca.markets"], secrets: 2 },
  polymarket: { network: ["clob.polymarket.com"], secrets: 4 },
  kalshi: { network: ["trading-api.kalshi.com"], secrets: 2 },
  manifold: { network: ["api.manifold.markets"], secrets: 1 },
  coinbase: { network: ["api.coinbase.com"], secrets: 2 },
  ibkr: { network: ["localhost:5000"], secrets: 1 },
  binance: { network: ["api.binance.com"], secrets: 2 },
  kraken: { network: ["api.kraken.com"], secrets: 2 },
  dydx: { network: ["indexer.dydx.trade"], secrets: 1 },
};

/**
 * Generate audit findings dynamically from current configuration state.
 */
function generateFindings(params: {
  tradingEnabled: boolean;
  approvalMode: string;
  tier: string;
  killSwitchActive: boolean;
  platforms: Record<string, { connected: boolean; mode: string }>;
  demoMode: boolean;
  limits: { maxDailySpendUsd: number; maxSingleTradeUsd: number };
}): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!params.tradingEnabled) {
    findings.push({
      checkId: "trading-disabled",
      severity: "info",
      title: "Trading module disabled",
      detail: "The trading subsystem is not enabled. Only messaging and agent features are active.",
    });
    findings.push({
      checkId: "config-file-permissions",
      severity: "info",
      title: "Config file permissions",
      detail: "~/.tigerpaw/tigerpaw.json should be readable by owner only (0600)",
      remediation: "Run: chmod 600 ~/.tigerpaw/tigerpaw.json",
    });
    return findings;
  }

  // Live mode + auto approval
  const hasLivePlatform = Object.values(params.platforms).some(
    (p) => p.connected && (p.mode === "live" || p.mode === "mainnet"),
  );

  if (hasLivePlatform && params.approvalMode === "auto") {
    findings.push({
      checkId: "trading-live-auto-approval",
      severity: "warn",
      title: "Live trading with auto-approval mode",
      detail:
        'Live trading is using approvalMode "auto" — trades execute without any human confirmation.',
      remediation: 'Consider switching to approvalMode "confirm" or "manual" for live trading.',
    });
  }

  // Aggressive tier on live
  if (hasLivePlatform && params.tier === "aggressive") {
    findings.push({
      checkId: "trading-live-aggressive-tier",
      severity: "warn",
      title: "Aggressive risk tier on live trading",
      detail:
        "The aggressive tier allows large trades and high daily spend. Limits are relaxed compared to conservative/moderate.",
      remediation:
        'Consider starting with "moderate" or "conservative" tier and adjusting individual limits via per-extension overrides.',
    });
  }

  // High limits check
  if (params.limits.maxSingleTradeUsd >= 500 && hasLivePlatform) {
    findings.push({
      checkId: "trading-high-single-trade-limit",
      severity: "warn",
      title: "High per-trade limit on live mode",
      detail: `maxSingleTradeUsd is set to $${params.limits.maxSingleTradeUsd}. A single erroneous trade could lose this amount.`,
      remediation: "Lower the per-trade limit or use per-extension overrides for risky platforms.",
    });
  }

  // Kill switch never activated (info)
  if (!params.killSwitchActive) {
    findings.push({
      checkId: "trading-killswitch-reminder",
      severity: "info",
      title: "Kill switch test reminder",
      detail:
        "Verify the kill switch works by activating it from the dashboard header or via messaging channel commands.",
      remediation: "Test the kill switch periodically to ensure it halts all trading activity.",
    });
  }

  // Demo mode active
  if (params.demoMode) {
    findings.push({
      checkId: "trading-demo-mode",
      severity: "info",
      title: "Demo mode active",
      detail:
        "The dashboard is showing sample data. Switch to Live in Trading Settings to view real positions.",
    });
  }

  // Connected platforms count
  const connectedCount = Object.values(params.platforms).filter((p) => p.connected).length;
  if (connectedCount === 0) {
    findings.push({
      checkId: "no-platforms-connected",
      severity: "info",
      title: "No trading platforms connected",
      detail: "Connect a platform from the Dashboard to start trading.",
    });
  }

  // Config file permissions (always show)
  findings.push({
    checkId: "config-file-permissions",
    severity: "info",
    title: "Config file permissions",
    detail: "~/.tigerpaw/tigerpaw.json should be readable by owner only (0600)",
    remediation: "Run: chmod 600 ~/.tigerpaw/tigerpaw.json",
  });

  return findings;
}

function FindingCard({ finding }: { finding: AuditFinding }) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 hover:shadow-lg transition-all duration-300",
        style.bg,
        style.border,
      )}
    >
      <div className="flex items-start gap-2 mb-1">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
            style.badge,
            style.badgeText,
          )}
        >
          {finding.severity}
        </span>
        <span className="text-sm font-medium text-neutral-200">{finding.title}</span>
      </div>
      <p className="text-xs text-neutral-400 mt-1">{finding.detail}</p>
      {finding.remediation && (
        <p className="text-xs text-neutral-500 mt-2 pl-3 border-l-2 border-[var(--glass-subtle-hover)]">
          {finding.remediation}
        </p>
      )}
    </div>
  );
}

export function SecurityPage() {
  const { t } = useTranslation("security");
  const tradingEnabled = useAppStore((s) => s.tradingEnabled);
  const approvalMode = useTradingStore((s) => s.approvalMode);
  const tier = useTradingStore((s) => s.tier);
  const killSwitchActive = useTradingStore((s) => s.killSwitchActive);
  const platforms = useTradingStore((s) => s.platforms);
  const demoMode = useTradingStore((s) => s.demoMode);
  const limits = useTradingStore((s) => s.limits);

  const findings = useMemo(
    () =>
      generateFindings({
        tradingEnabled,
        approvalMode,
        tier,
        killSwitchActive,
        platforms,
        demoMode,
        limits,
      }),
    [tradingEnabled, approvalMode, tier, killSwitchActive, platforms, demoMode, limits],
  );

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  const infoCount = findings.filter((f) => f.severity === "info").length;

  // Build extension permissions from connected platforms
  const connectedPlatforms = Object.entries(platforms).filter(([, p]) => p.connected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">{t("title")}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 hover:bg-red-950/30 hover:border-red-700/60 transition-all duration-300 p-4 text-center">
          <div className="text-2xl font-bold text-red-400 font-mono">{criticalCount}</div>
          <div className="text-xs text-red-400/60">{t("critical")}</div>
        </div>
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 hover:bg-amber-950/30 hover:border-amber-700/60 transition-all duration-300 p-4 text-center">
          <div className="text-2xl font-bold text-amber-400 font-mono">{warnCount}</div>
          <div className="text-xs text-amber-400/60">{t("warnings")}</div>
        </div>
        <div className="rounded-2xl glass-panel p-4 text-center">
          <div className="text-2xl font-bold text-neutral-400 font-mono">{infoCount}</div>
          <div className="text-xs text-neutral-500">{t("info")}</div>
        </div>
      </div>

      {/* Audit Findings */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">{t("auditFindings")}</h2>
        <div className="space-y-2">
          {findings.map((finding) => (
            <FindingCard key={finding.checkId} finding={finding} />
          ))}
        </div>
      </div>

      {/* Extension Permissions — only when trading is enabled */}
      {tradingEnabled && connectedPlatforms.length > 0 && (
        <div className="rounded-2xl glass-panel p-4">
          <h3 className="text-sm font-semibold text-neutral-300 mb-3">
            {t("extensionPermissions")}
          </h3>
          <div className="space-y-3">
            {connectedPlatforms.map(([id, platform]) => {
              const perms = PLATFORM_PERMISSIONS[id];
              const permLabels: string[] = [];
              if (perms) {
                permLabels.push("trading");
                if (perms.network.length > 0) {
                  permLabels.push(`network: ${perms.network.join(", ")}`);
                }
                permLabels.push(`${perms.secrets} secret(s)`);
              }

              return (
                <div key={id} className="py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-neutral-200">{platform.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-500 hover:bg-[var(--glass-border)] hover:text-neutral-400 transition-colors duration-200">
                      {t("unverified")}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        platform.mode === "live" || platform.mode === "mainnet"
                          ? "bg-green-900/50 text-green-400"
                          : "bg-blue-900/50 text-blue-400",
                      )}
                    >
                      {platform.mode}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {permLabels.map((perm) => (
                      <span
                        key={perm}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-500 hover:bg-[var(--glass-border)] hover:text-neutral-400 transition-colors duration-200"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-neutral-600 mt-3">
            {t(
              "signatureNote",
              "Extensions are unsigned — Ed25519 signature verification is available but no trusted publisher keys are registered yet.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
