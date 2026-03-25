import { cn } from "@/lib/utils";

type AuditFinding = {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
};

// Demo findings for visual review
const DEMO_FINDINGS: AuditFinding[] = [
  {
    checkId: "trading-live-manual-recommended",
    severity: "warn",
    title: "Live trading with auto-approval mode",
    detail:
      'Live trading is using approvalMode "auto" — trades execute without any human confirmation.',
    remediation: 'Consider switching to approvalMode "confirm" or "manual" for live trading.',
  },
  {
    checkId: "trading-no-kill-switch-tested",
    severity: "info",
    title: "Kill switch test reminder",
    detail:
      "Verify the kill switch works by running: tigerpaw trading kill && tigerpaw trading resume",
    remediation: "Test the kill switch periodically to ensure it halts all trading activity.",
  },
  {
    checkId: "config-file-permissions",
    severity: "info",
    title: "Config file permissions",
    detail: "~/.tigerpaw/tigerpaw.json is readable by owner only (0600)",
  },
];

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
  const criticalCount = DEMO_FINDINGS.filter((f) => f.severity === "critical").length;
  const warnCount = DEMO_FINDINGS.filter((f) => f.severity === "warn").length;
  const infoCount = DEMO_FINDINGS.filter((f) => f.severity === "info").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">Security Dashboard</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Security audit results, credential status, and extension permissions
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 hover:bg-red-950/30 hover:border-red-700/60 transition-all duration-300 p-4 text-center">
          <div className="text-2xl font-bold text-red-400 font-mono">{criticalCount}</div>
          <div className="text-xs text-red-400/60">Critical</div>
        </div>
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 hover:bg-amber-950/30 hover:border-amber-700/60 transition-all duration-300 p-4 text-center">
          <div className="text-2xl font-bold text-amber-400 font-mono">{warnCount}</div>
          <div className="text-xs text-amber-400/60">Warnings</div>
        </div>
        <div className="rounded-2xl glass-panel p-4 text-center">
          <div className="text-2xl font-bold text-neutral-400 font-mono">{infoCount}</div>
          <div className="text-xs text-neutral-500">Info</div>
        </div>
      </div>

      {/* Audit Findings */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Audit Findings</h2>
        <div className="space-y-2">
          {DEMO_FINDINGS.map((finding) => (
            <FindingCard key={finding.checkId} finding={finding} />
          ))}
        </div>
      </div>

      {/* Credential Status */}
      <div className="rounded-2xl glass-panel p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Credential Status</h3>
        <div className="space-y-2">
          {[
            { ext: "Alpaca", keys: 2, method: "OS Keychain", age: "12 days" },
            { ext: "Polymarket", keys: 4, method: "OS Keychain", age: "5 days" },
            { ext: "Kalshi", keys: 2, method: "Encrypted file", age: "30 days" },
            { ext: "Manifold", keys: 1, method: "Env var", age: "45 days" },
          ].map((cred) => (
            <div
              key={cred.ext}
              className="flex items-center justify-between py-1.5 border-b border-[var(--glass-divider)] last:border-0 hover:bg-[var(--glass-divider)] transition-colors duration-200 rounded-md px-2 -mx-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-300">{cred.ext}</span>
                <span className="text-xs text-neutral-600">{cred.keys} key(s)</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-neutral-500">{cred.method}</span>
                <span className="text-neutral-600">{cred.age}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extension Permissions */}
      <div className="rounded-2xl glass-panel p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Extension Permissions</h3>
        <div className="space-y-3">
          {[
            {
              name: "Alpaca",
              perms: ["trading", "network: api.alpaca.markets", "2 secrets"],
              verified: true,
            },
            {
              name: "Polymarket",
              perms: ["trading", "network: clob.polymarket.com", "4 secrets"],
              verified: true,
            },
            {
              name: "Kalshi",
              perms: ["trading", "network: trading-api.kalshi.com", "2 secrets"],
              verified: false,
            },
            {
              name: "Manifold",
              perms: ["trading", "network: api.manifold.markets", "1 secret"],
              verified: false,
            },
          ].map((ext) => (
            <div key={ext.name} className="py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-neutral-200">{ext.name}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    ext.verified
                      ? "bg-green-900/50 text-green-400"
                      : "bg-[var(--glass-subtle-hover)] text-neutral-500 hover:bg-[var(--glass-border)] hover:text-neutral-400 transition-colors duration-200",
                  )}
                >
                  {ext.verified ? "verified" : "unverified"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ext.perms.map((perm) => (
                  <span
                    key={perm}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--glass-subtle-hover)] text-neutral-500 hover:bg-[var(--glass-border)] hover:text-neutral-400 transition-colors duration-200"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
