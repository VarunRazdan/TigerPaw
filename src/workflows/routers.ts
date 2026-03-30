/**
 * Router evaluators for workflow router nodes.
 *
 * Routers direct flow to one of several named outputs.
 * Unlike conditions (which return boolean), routers return a `selectedOutput`
 * string that the engine uses to filter outgoing edges by label.
 *
 * - if_else: evaluates an expression → "true" or "false"
 * - switch: matches a field value against cases → case name or fallback
 */

import type { ExecutionContext } from "./context.js";

export type RouterResult = {
  selectedOutput: string;
  evaluatedValue?: unknown;
};

type RouterEvaluator = (config: Record<string, unknown>, ctx: ExecutionContext) => RouterResult;

// ── If/Else ──────────────────────────────────────────────────────────

function ifElse(config: Record<string, unknown>, ctx: ExecutionContext): RouterResult {
  const left = (config.left as string | undefined) ?? "";
  const operator = (config.operator as string | undefined) ?? "==";
  const right = (config.right as string | undefined) ?? "";

  // Resolve values from context if prefixed with $
  const leftVal = left.startsWith("$") ? ctx.getPath(left.slice(1)) : left;
  const rightVal = right.startsWith("$") ? ctx.getPath(right.slice(1)) : right;

  const leftNum = Number(leftVal);
  const rightNum = Number(rightVal);
  const bothNumeric = !isNaN(leftNum) && !isNaN(rightNum) && left !== "" && right !== "";

  let result = false;

  switch (operator) {
    case "==":
    case "equals":
      result = String(leftVal as string) === String(rightVal as string);
      break;
    case "!=":
    case "not_equals":
      result = String(leftVal as string) !== String(rightVal as string);
      break;
    case ">":
      result = bothNumeric && leftNum > rightNum;
      break;
    case ">=":
      result = bothNumeric && leftNum >= rightNum;
      break;
    case "<":
      result = bothNumeric && leftNum < rightNum;
      break;
    case "<=":
      result = bothNumeric && leftNum <= rightNum;
      break;
    case "contains":
      result = String(leftVal as string).includes(String(rightVal as string));
      break;
    case "starts_with":
      result = String(leftVal as string).startsWith(String(rightVal as string));
      break;
    case "ends_with":
      result = String(leftVal as string).endsWith(String(rightVal as string));
      break;
    case "is_empty":
      result = leftVal == null || String(leftVal as string) === "";
      break;
    case "is_not_empty":
      result = leftVal != null && String(leftVal as string) !== "";
      break;
    case "matches":
      try {
        result = new RegExp(String(rightVal as string), "i").test(String(leftVal as string));
      } catch {
        result = false;
      }
      break;
    default:
      result = false;
  }

  return {
    selectedOutput: result ? "true" : "false",
    evaluatedValue: leftVal,
  };
}

// ── Switch ───────────────────────────────────────────────────────────

function switchRouter(config: Record<string, unknown>, ctx: ExecutionContext): RouterResult {
  const field = (config.field as string | undefined) ?? "";
  const fallback = (config.fallback as string | undefined) ?? "default";
  const cases = (config.cases as Array<{ value: string; output: string }> | undefined) ?? [];

  if (!field) {
    return { selectedOutput: fallback };
  }

  // Resolve field value from context
  const value = field.startsWith("$") ? ctx.getPath(field.slice(1)) : ctx.get(field);
  const strValue = value == null ? "" : String(value as string);

  for (const c of cases) {
    if (c.value === strValue) {
      return { selectedOutput: c.output, evaluatedValue: value };
    }
  }

  return { selectedOutput: fallback, evaluatedValue: value };
}

// ── Loop ──────────────────────────────────────────────────────────────

function loop(config: Record<string, unknown>, ctx: ExecutionContext): RouterResult {
  const arrayPath = (config.arrayPath as string | undefined) ?? "";

  if (!arrayPath) {
    return { selectedOutput: "done", evaluatedValue: { arrayLength: 0 } };
  }

  const rawArray = arrayPath.startsWith("$") ? ctx.getPath(arrayPath.slice(1)) : ctx.get(arrayPath);

  const items = Array.isArray(rawArray) ? rawArray : [];

  return {
    selectedOutput: items.length > 0 ? "loop" : "done",
    evaluatedValue: { arrayLength: items.length },
  };
}

// ── Registry ─────────────────────────────────────────────────────────

const evaluators: Record<string, RouterEvaluator> = {
  if_else: ifElse,
  switch: switchRouter,
  loop,
};

/**
 * Evaluate a router node. Returns the selected output label.
 * Unknown subtypes return fallback output "default".
 */
export function evaluateRouter(
  subtype: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): RouterResult {
  const evaluator = evaluators[subtype];
  if (!evaluator) {
    return { selectedOutput: "default" };
  }
  try {
    return evaluator(config, ctx);
  } catch {
    return { selectedOutput: "default" };
  }
}

/** List all supported router subtypes. */
export function supportedRouters(): string[] {
  return Object.keys(evaluators);
}
