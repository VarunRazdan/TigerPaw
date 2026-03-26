/**
 * i18n key completeness checker.
 *
 * Validates that all non-English locale files have the same keys as their
 * English counterparts, and that {{variable}} interpolation placeholders
 * match. Checks both UI (ui/src/i18n/locales/) and backend (src/i18n/locales/).
 *
 * Usage: npx tsx scripts/check-i18n-keys.ts
 * Exit code 1 if any missing keys found.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");

const LOCALE_ROOTS = [
  { label: "UI", dir: join(ROOT, "ui/src/i18n/locales") },
  { label: "Backend", dir: join(ROOT, "src/i18n/locales") },
];

type Issue = {
  locale: string;
  namespace: string;
  layer: string;
  type: "missing" | "extra" | "var_mismatch";
  key: string;
  detail?: string;
};

function extractVars(template: string): Set<string> {
  const vars = new Set<string>();
  for (const match of template.matchAll(/\{\{(\w+)\}\}/g)) {
    vars.add(match[1]);
  }
  return vars;
}

function loadJson(filePath: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error(`  ERROR: Failed to parse ${relative(ROOT, filePath)}: ${String(e)}`);
    return {};
  }
}

function checkLocaleRoot(label: string, dir: string): Issue[] {
  if (!existsSync(dir)) {
    console.log(`  SKIP: ${relative(ROOT, dir)} does not exist`);
    return [];
  }

  const enDir = join(dir, "en");
  if (!existsSync(enDir)) {
    console.error(`  ERROR: No English locale at ${relative(ROOT, enDir)}`);
    return [];
  }

  // Discover namespaces from English directory
  const namespaces = readdirSync(enDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  // Discover non-English locales
  const locales = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "en")
    .map((d) => d.name);

  const issues: Issue[] = [];

  for (const ns of namespaces) {
    const enFile = join(enDir, `${ns}.json`);
    const enData = loadJson(enFile);
    const enKeys = Object.keys(enData).filter((k) => !k.startsWith("_"));

    for (const locale of locales) {
      const localeFile = join(dir, locale, `${ns}.json`);

      if (!existsSync(localeFile)) {
        // Entire namespace file missing
        for (const key of enKeys) {
          issues.push({ locale, namespace: ns, layer: label, type: "missing", key });
        }
        continue;
      }

      const localeData = loadJson(localeFile);
      const localeKeys = new Set(Object.keys(localeData).filter((k) => !k.startsWith("_")));

      // Check for missing keys
      for (const key of enKeys) {
        if (!localeKeys.has(key)) {
          issues.push({ locale, namespace: ns, layer: label, type: "missing", key });
        }
      }

      // Check for extra keys (typos or stale translations)
      for (const key of localeKeys) {
        if (!enKeys.includes(key)) {
          issues.push({ locale, namespace: ns, layer: label, type: "extra", key });
        }
      }

      // Check interpolation variable consistency
      for (const key of enKeys) {
        if (!localeKeys.has(key)) {
          continue;
        }
        const enVars = extractVars(enData[key]);
        const localeVars = extractVars(localeData[key]);

        // Check for missing variables in translation
        for (const v of enVars) {
          if (!localeVars.has(v)) {
            issues.push({
              locale,
              namespace: ns,
              layer: label,
              type: "var_mismatch",
              key,
              detail: `missing {{${v}}}`,
            });
          }
        }

        // Check for extra variables in translation
        for (const v of localeVars) {
          if (!enVars.has(v)) {
            issues.push({
              locale,
              namespace: ns,
              layer: label,
              type: "var_mismatch",
              key,
              detail: `extra {{${v}}}`,
            });
          }
        }
      }
    }
  }

  return issues;
}

// --- Main ---

console.log("i18n key validation\n");

let allIssues: Issue[] = [];

for (const { label, dir } of LOCALE_ROOTS) {
  console.log(`Checking ${label} locales (${relative(ROOT, dir)})...`);
  const issues = checkLocaleRoot(label, dir);
  allIssues = allIssues.concat(issues);
}

if (allIssues.length === 0) {
  console.log("\nAll locale files are complete. No issues found.");
  process.exit(0);
}

// Group by type for reporting
const missing = allIssues.filter((i) => i.type === "missing");
const extra = allIssues.filter((i) => i.type === "extra");
const varMismatch = allIssues.filter((i) => i.type === "var_mismatch");

console.log("");

if (missing.length > 0) {
  console.log(`MISSING KEYS (${missing.length}):`);
  const grouped = new Map<string, string[]>();
  for (const i of missing) {
    const groupKey = `${i.layer}/${i.locale}/${i.namespace}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push(i.key);
  }
  for (const [group, keys] of grouped) {
    console.log(`  ${group}: ${keys.join(", ")}`);
  }
  console.log("");
}

if (extra.length > 0) {
  console.log(`EXTRA KEYS (${extra.length}):`);
  for (const i of extra) {
    console.log(`  ${i.layer}/${i.locale}/${i.namespace}: ${i.key}`);
  }
  console.log("");
}

if (varMismatch.length > 0) {
  console.log(`VARIABLE MISMATCHES (${varMismatch.length}):`);
  for (const i of varMismatch) {
    console.log(`  ${i.layer}/${i.locale}/${i.namespace}: ${i.key} — ${i.detail}`);
  }
  console.log("");
}

const total = allIssues.length;
console.log(
  `Total issues: ${total} (${missing.length} missing, ${extra.length} extra, ${varMismatch.length} var mismatches)`,
);

// Exit with error only if there are missing keys
if (missing.length > 0) {
  process.exit(1);
}
