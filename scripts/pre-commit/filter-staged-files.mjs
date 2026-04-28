#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Prints selected files as NUL-delimited tokens to stdout.
 *
 * Usage:
 *   node scripts/pre-commit/filter-staged-files.mjs lint -- <files...>
 *   node scripts/pre-commit/filter-staged-files.mjs format -- <files...>
 *
 * Keep this dependency-free: the pre-commit hook runs in many environments.
 */

const mode = process.argv[2];
const rawArgs = process.argv.slice(3);
const files = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (mode !== "lint" && mode !== "format") {
  process.stderr.write("usage: filter-staged-files.mjs <lint|format> -- <files...>\n");
  process.exit(2);
}

const lintExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const formatExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx"]);

// Honor .oxlintrc.json ignorePatterns so the pre-commit hook doesn't pass
// files to oxlint that the linter will then refuse with exit code 1
// ("no files found to lint"). Without this, a commit that only touches
// e.g. extensions/* would trip the hook even though the lint config
// explicitly ignores that path.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
let oxlintIgnorePatterns = [];
try {
  const cfg = JSON.parse(readFileSync(path.join(repoRoot, ".oxlintrc.json"), "utf8"));
  oxlintIgnorePatterns = Array.isArray(cfg.ignorePatterns) ? cfg.ignorePatterns : [];
} catch {
  // Missing/malformed config — degrade to extension-only filtering.
}

const isOxlintIgnored = (filePath) => {
  // Patterns are tested against the repo-relative path. Treat trailing-slash
  // patterns as directory prefixes (the same convention oxlint uses for
  // glob-free ignorePatterns entries like "extensions/" or "dist/").
  for (const pattern of oxlintIgnorePatterns) {
    if (!pattern) {
      continue;
    }
    if (pattern.endsWith("/")) {
      if (filePath === pattern.slice(0, -1) || filePath.startsWith(pattern)) {
        return true;
      }
    } else if (filePath === pattern) {
      return true;
    }
  }
  return false;
};

const shouldSelect = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (mode === "lint") {
    if (!lintExts.has(ext)) {
      return false;
    }
    return !isOxlintIgnored(filePath);
  }
  return formatExts.has(ext);
};

for (const file of files) {
  if (shouldSelect(file)) {
    process.stdout.write(file);
    process.stdout.write("\0");
  }
}
