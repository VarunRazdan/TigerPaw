/**
 * Condition evaluators for workflow condition nodes.
 *
 * Each evaluator receives the node config and execution context,
 * and returns true (follow "match" edge) or false (follow "no-match" edge).
 */

import type { ExecutionContext } from "./context.js";

type ConditionEvaluator = (config: Record<string, unknown>, ctx: ExecutionContext) => boolean;

// ── Individual evaluators ─────────────────────────────────────────

function containsKeyword(config: Record<string, unknown>, ctx: ExecutionContext): boolean {
  const keyword = (config.keyword as string | undefined) ?? "";
  const caseSensitive = Boolean(config.caseSensitive);
  if (!keyword) {
    return false;
  }

  const text = (ctx.get("text") ?? ctx.get("message") ?? ctx.get("preview") ?? "") as string;
  if (caseSensitive) {
    return text.includes(keyword);
  }
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function senderMatches(config: Record<string, unknown>, ctx: ExecutionContext): boolean {
  const pattern = (config.pattern as string | undefined) ?? "";
  if (!pattern) {
    return false;
  }

  const sender = (ctx.get("sender") ?? ctx.get("author") ?? "") as string;
  try {
    return new RegExp(pattern, "i").test(sender);
  } catch {
    // Invalid regex — fall back to includes
    return sender.toLowerCase().includes(pattern.toLowerCase());
  }
}

function channelIs(config: Record<string, unknown>, ctx: ExecutionContext): boolean {
  const target = ((config.channel as string | undefined) ?? "").toLowerCase();
  if (!target) {
    return false;
  }
  const actual = ((ctx.get("channel") ?? "") as string).toLowerCase();
  return actual === target;
}

function timeOfDay(config: Record<string, unknown>, _ctx: ExecutionContext): boolean {
  const after = (config.after as string | undefined) ?? "00:00";
  const before = (config.before as string | undefined) ?? "23:59";
  const tz = config.timezone as string | undefined;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz ?? undefined,
  });
  const currentTime = formatter.format(now); // "HH:MM"

  return currentTime >= after && currentTime <= before;
}

function expression(config: Record<string, unknown>, ctx: ExecutionContext): boolean {
  const left = (config.left as string | undefined) ?? "";
  const operator = (config.operator as string | undefined) ?? "==";
  const right = (config.right as string | undefined) ?? "";

  // Resolve left/right as context paths if they start with "$"
  const leftVal = left.startsWith("$") ? ctx.getPath(left.slice(1)) : left;
  const rightVal = right.startsWith("$") ? ctx.getPath(right.slice(1)) : right;

  const leftNum = Number(leftVal);
  const rightNum = Number(rightVal);
  const bothNumeric = !isNaN(leftNum) && !isNaN(rightNum) && left !== "" && right !== "";

  switch (operator) {
    case "==":
    case "equals":
      return String(leftVal as string) === String(rightVal as string);
    case "!=":
    case "not_equals":
      return String(leftVal as string) !== String(rightVal as string);
    case ">":
      return bothNumeric && leftNum > rightNum;
    case ">=":
      return bothNumeric && leftNum >= rightNum;
    case "<":
      return bothNumeric && leftNum < rightNum;
    case "<=":
      return bothNumeric && leftNum <= rightNum;
    case "contains":
      return String(leftVal as string).includes(String(rightVal as string));
    case "starts_with":
      return String(leftVal as string).startsWith(String(rightVal as string));
    case "ends_with":
      return String(leftVal as string).endsWith(String(rightVal as string));
    case "matches":
      try {
        return new RegExp(String(rightVal as string), "i").test(String(leftVal as string));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

// ── Registry ──────────────────────────────────────────────────────

const evaluators: Record<string, ConditionEvaluator> = {
  contains_keyword: containsKeyword,
  sender_matches: senderMatches,
  channel_is: channelIs,
  time_of_day: timeOfDay,
  expression,
};

/**
 * Evaluate a condition node. Returns true if the condition is met.
 * Unknown subtypes return false (safe default: don't execute unrecognized conditions).
 */
export function evaluateCondition(
  subtype: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): boolean {
  const evaluator = evaluators[subtype];
  if (!evaluator) {
    return false;
  }
  try {
    return evaluator(config, ctx);
  } catch {
    return false;
  }
}

/** List all supported condition subtypes. */
export function supportedConditions(): string[] {
  return Object.keys(evaluators);
}
