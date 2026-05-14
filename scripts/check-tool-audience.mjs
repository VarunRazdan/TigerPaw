#!/usr/bin/env node
/**
 * CI guard: every first-party tool definition must declare `audience:
 * "owner" | "all"`.
 *
 * Why: `src/agents/tool-policy.ts` `applyOwnerOnlyToolPolicy` runs a
 * deny-by-default safety net that treats a missing `audience` as
 * `"owner"`. That keeps non-owner senders safe from a forgotten audience
 * — but the resulting tool is silently inaccessible to non-owners. We
 * want devs to see the issue at PR time, not at runtime, so this guard
 * fails the build on any tool object that has both `name:` and `execute:`
 * (or a TSchema-shaped `parameters:` field) but no `audience:`.
 *
 * Pattern modeled on `scripts/check-no-register-http-handler.mjs` (full
 * TS AST — regex doesn't catch multi-line returns or factory-function
 * shapes).
 */

import ts from "typescript";
import { runCallsiteGuard } from "./lib/callsite-guard.mjs";
import { runAsScript, toLine } from "./lib/ts-guard-utils.mjs";

// Only first-party tool source roots. Plugin tools under extensions/ get
// a "owner" default at runtime via the policy enforcer + a deprecation
// log; we don't want this guard tripping on plugin code.
const sourceRoots = ["src/agents/tools", "src/channels/plugins/agent-tools"];

function objectLiteralHasProperty(node, name) {
  return node.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop)) {
      return false;
    }
    const propName = prop.name;
    if (ts.isIdentifier(propName) || ts.isStringLiteral(propName)) {
      return propName.text === name;
    }
    return false;
  });
}

/**
 * A tool object literal has all three of: `name`, `execute`, and either
 * `parameters` or `description`. We use this conservative shape so that
 * arbitrary helper objects (returned by factory helpers, etc.) don't
 * trigger false positives.
 */
function looksLikeToolObjectLiteral(node) {
  if (!ts.isObjectLiteralExpression(node)) {
    return false;
  }
  const hasName = objectLiteralHasProperty(node, "name");
  const hasExecute = objectLiteralHasProperty(node, "execute");
  const hasParams =
    objectLiteralHasProperty(node, "parameters") || objectLiteralHasProperty(node, "description");
  return hasName && hasExecute && hasParams;
}

export function findToolLiteralsMissingAudience(content, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const lines = [];
  const visit = (node) => {
    if (looksLikeToolObjectLiteral(node) && !objectLiteralHasProperty(node, "audience")) {
      lines.push(toLine(sourceFile, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lines;
}

export async function main() {
  await runCallsiteGuard({
    importMetaUrl: import.meta.url,
    sourceRoots,
    findCallLines: findToolLiteralsMissingAudience,
    header: "Tool definitions missing required `audience` field:",
    footer:
      'Add `audience: "owner" | "all"` to each tool object literal. ' +
      '`"owner"` = only the gateway owner / configured owner senders may invoke; ' +
      '`"all"` = any sender may invoke (subject to channel allowlists). ' +
      "See src/agents/tool-policy-shared.ts.",
  });
}

runAsScript(import.meta.url, main);
