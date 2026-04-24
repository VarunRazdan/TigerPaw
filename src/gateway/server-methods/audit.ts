/**
 * RPC methods: audit.list, audit.verify
 *
 * Surfaces the HMAC-chained trading audit log. Data comes from
 * `dalReadAuditEntries()` (SQLite-backed); chain verification runs through
 * `verifyAuditChain()` which re-derives each HMAC and confirms prev-hash
 * linkage. Both are read-only; no writes happen here.
 */
import { dalReadAuditEntries, type AuditEntryRow } from "../../dal/trading-audit.js";
import { verifyAuditChain } from "../../trading/audit-log.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function clampLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(raw)), MAX_LIMIT);
}

function clampOffset(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

function matchesFilters(
  entry: AuditEntryRow,
  filters: {
    extensionId?: string;
    action?: string;
    actor?: string;
    dateFrom?: string;
    dateTo?: string;
  },
): boolean {
  if (filters.extensionId && entry.extensionId !== filters.extensionId) {
    return false;
  }
  if (filters.action && entry.action !== filters.action) {
    return false;
  }
  if (filters.actor && entry.actor !== filters.actor) {
    return false;
  }
  if (filters.dateFrom && entry.timestamp < filters.dateFrom) {
    return false;
  }
  if (filters.dateTo && entry.timestamp > filters.dateTo) {
    return false;
  }
  return true;
}

export const auditHandlers: GatewayRequestHandlers = {
  "audit.list": async ({ params, respond }) => {
    try {
      const limit = clampLimit(params.limit);
      const offset = clampOffset(params.offset);
      const filters = {
        extensionId: typeof params.extensionId === "string" ? params.extensionId : undefined,
        action: typeof params.action === "string" ? params.action : undefined,
        actor: typeof params.actor === "string" ? params.actor : undefined,
        dateFrom: typeof params.dateFrom === "string" ? params.dateFrom : undefined,
        dateTo: typeof params.dateTo === "string" ? params.dateTo : undefined,
      };

      // DAL returns ascending (oldest first). The UI wants newest first.
      const all = dalReadAuditEntries();
      const filtered = all.filter((e) => matchesFilters(e, filters));
      const newestFirst = filtered.toReversed();
      const page = newestFirst.slice(offset, offset + limit);

      respond(
        true,
        {
          entries: page,
          total: filtered.length,
          limit,
          offset,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "audit.verify": async ({ respond }) => {
    try {
      const result = await verifyAuditChain();
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
