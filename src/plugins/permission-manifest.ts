/**
 * Extension permission manifest support for Tigerpaw.
 *
 * Declarative permissions declared in tigerpaw.plugin.json:
 * - network: allowed hostnames
 * - trading: whether the extension performs trades
 * - filesystem: whether the extension needs fs access
 * - secrets: which secret IDs the extension reads
 *
 * These are declarative (not runtime-enforced -- plugins run in-process).
 * They are displayed in the Security Dashboard and checked by `tigerpaw doctor`.
 */

export type ExtensionPermissions = {
  /** Allowed network hostnames (e.g. ["api.polymarket.com"]). */
  network?: string[];
  /** Whether this extension performs trading operations. */
  trading?: boolean;
  /** Whether this extension needs filesystem access. */
  filesystem?: boolean;
  /** Secret IDs this extension reads (e.g. ["polymarket.apiKey"]). */
  secrets?: string[];
};

export type PermissionManifestValidationResult = {
  valid: boolean;
  warnings: string[];
};

/**
 * Parse and validate a permissions block from a plugin manifest.
 */
export function parseExtensionPermissions(raw: unknown): ExtensionPermissions | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;
  const permissions: ExtensionPermissions = {};

  if (Array.isArray(obj.network)) {
    permissions.network = obj.network
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof obj.trading === "boolean") {
    permissions.trading = obj.trading;
  }

  if (typeof obj.filesystem === "boolean") {
    permissions.filesystem = obj.filesystem;
  }

  if (Array.isArray(obj.secrets)) {
    permissions.secrets = obj.secrets
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return permissions;
}

/**
 * Validate declared permissions for completeness.
 */
export function validatePermissionManifest(
  permissions: ExtensionPermissions | undefined,
): PermissionManifestValidationResult {
  const warnings: string[] = [];

  if (!permissions) {
    warnings.push("No permissions declared. Consider adding a permissions block.");
    return { valid: true, warnings };
  }

  if (permissions.trading && (!permissions.secrets || permissions.secrets.length === 0)) {
    warnings.push(
      "Extension declares trading=true but no secrets. Trading extensions typically need API credentials.",
    );
  }

  if (permissions.trading && (!permissions.network || permissions.network.length === 0)) {
    warnings.push(
      "Extension declares trading=true but no network permissions. Trading requires API connectivity.",
    );
  }

  return { valid: true, warnings };
}

/**
 * Format a permissions summary for display during install or in the Security Dashboard.
 */
export function formatPermissionsSummary(permissions: ExtensionPermissions): string[] {
  const lines: string[] = [];

  if (permissions.trading) {
    lines.push("trading: can place trades and manage orders");
  }
  if (permissions.network?.length) {
    lines.push(`network: ${permissions.network.join(", ")}`);
  }
  if (permissions.filesystem) {
    lines.push("filesystem: can read/write local files");
  }
  if (permissions.secrets?.length) {
    lines.push(`secrets: ${permissions.secrets.length} credential(s)`);
  }

  return lines;
}
