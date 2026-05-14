import {
  CORE_TOOL_GROUPS,
  resolveCoreToolProfilePolicy,
  type ToolProfileId,
} from "./tool-catalog.js";

/**
 * Minimal shape used by the audience guard. Mirrors the relevant fields on
 * `AnyAgentTool` without depending on `tools/common.ts` (which imports
 * `node:fs/promises` and would break the browser-safety contract of this
 * module). Kept structural so the guard accepts any concrete tool shape.
 */
type OwnerGuardable = {
  audience?: "owner" | "all";
  /** @deprecated kept for back-compat */
  ownerOnly?: boolean;
};

export const OWNER_ONLY_TOOL_ERROR = "Tool restricted to owner senders.";

/**
 * Wrap a tool's `execute` with an owner-only guard so non-owner senders see
 * a clear error instead of silently executing. Idempotent — wrapping a tool
 * twice is safe.
 *
 * Note: we intentionally wrap *regardless of whether `execute` is currently
 * defined*. If a tool's `execute` is attached after construction (e.g. a
 * lazy adapter), the wrap still protects subsequent calls. The previous
 * implementation returned the unwrapped tool when `execute` was missing,
 * leaking the owner-only intent.
 */
export function wrapOwnerOnlyToolExecution<T extends OwnerGuardable>(
  tool: T,
  senderIsOwner: boolean,
): T {
  const isOwnerOnly = tool.audience === "owner" || tool.ownerOnly === true;
  if (!isOwnerOnly || senderIsOwner) {
    return tool;
  }
  return {
    ...tool,
    execute: async () => {
      throw new Error(OWNER_ONLY_TOOL_ERROR);
    },
  };
}

type ToolProfilePolicy = {
  allow?: string[];
  deny?: string[];
};

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

export const TOOL_GROUPS: Record<string, string[]> = { ...CORE_TOOL_GROUPS };

export function normalizeToolName(name: string) {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

export function normalizeToolList(list?: string[]) {
  if (!list) {
    return [];
  }
  return list.map(normalizeToolName).filter(Boolean);
}

export function expandToolGroups(list?: string[]) {
  const normalized = normalizeToolList(list);
  const expanded: string[] = [];
  for (const value of normalized) {
    const group = TOOL_GROUPS[value];
    if (group) {
      expanded.push(...group);
      continue;
    }
    expanded.push(value);
  }
  return Array.from(new Set(expanded));
}

export function resolveToolProfilePolicy(profile?: string): ToolProfilePolicy | undefined {
  return resolveCoreToolProfilePolicy(profile);
}

export type { ToolProfileId };
