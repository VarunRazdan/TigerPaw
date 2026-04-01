import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * On Windows `path.resolve("/test/foo")` prepends the current drive letter
 * (e.g. `D:\test\foo`), so a straight equality check against the Unix-style
 * input fails. Strip the optional drive prefix and normalise slashes.
 */
function normalizeDirForComparison(p: string): string {
  return p.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
}

describe("installation verification", () => {
  it("tigerpaw.mjs entry point exists and is executable", () => {
    const entry = path.join(ROOT, "tigerpaw.mjs");
    expect(fs.existsSync(entry)).toBe(true);
    const content = fs.readFileSync(entry, "utf-8");
    expect(content).toContain("#!/usr/bin/env node");
  });

  it("openclaw.mjs legacy entry point exists", () => {
    const entry = path.join(ROOT, "openclaw.mjs");
    expect(fs.existsSync(entry)).toBe(true);
    const content = fs.readFileSync(entry, "utf-8");
    expect(content).toContain("#!/usr/bin/env node");
  });

  it("package.json has correct package name and bin entries", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    expect(pkg.name).toBe("@greatlyrecommended/tigerpaw");
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.tigerpaw).toBeDefined();
    expect(pkg.bin.openclaw).toBeDefined();
  });

  it("resolveCliName defaults to tigerpaw", async () => {
    const { resolveCliName } = await import("../src/cli/cli-name.js");
    // With no matching argv1, should default to tigerpaw
    expect(resolveCliName(["node", "/usr/bin/tigerpaw"])).toBe("tigerpaw");
    expect(resolveCliName(["node", "/some/path/unknown"])).toBe("tigerpaw");
  });

  it("resolveCliName recognizes all known CLI names", async () => {
    const { resolveCliName } = await import("../src/cli/cli-name.js");
    expect(resolveCliName(["node", "/usr/bin/tigerpaw"])).toBe("tigerpaw");
    expect(resolveCliName(["node", "/usr/bin/openclaw"])).toBe("openclaw");
    expect(resolveCliName(["node", "/usr/bin/tigerclaw"])).toBe("tigerclaw");
  });

  it("resolveCliName strips .mjs extension in dev mode", async () => {
    const { resolveCliName } = await import("../src/cli/cli-name.js");
    expect(resolveCliName(["node", "openclaw.mjs"])).toBe("openclaw");
    expect(resolveCliName(["node", "tigerpaw.mjs"])).toBe("tigerpaw");
  });

  it("replaceCliName substitutes openclaw with resolved name", async () => {
    const { replaceCliName } = await import("../src/cli/cli-name.js");
    expect(replaceCliName("openclaw doctor --fix", "tigerpaw")).toBe("tigerpaw doctor --fix");
    expect(replaceCliName("pnpm openclaw doctor", "tigerpaw")).toBe("pnpm tigerpaw doctor");
    expect(replaceCliName("openclaw gateway run", "tigerpaw")).toBe("tigerpaw gateway run");
  });

  it("formatCliCommand replaces openclaw with tigerpaw in output", async () => {
    const { formatCliCommand } = await import("../src/cli/command-format.js");
    const result = formatCliCommand("openclaw doctor --fix", {});
    expect(result).toBe("tigerpaw doctor --fix");
  });

  it("config paths resolve tigerpaw state dir", async () => {
    const { resolveStateDir } = await import("../src/config/paths.js");
    const env = { TIGERPAW_STATE_DIR: "/test/tigerpaw-state" } as unknown as NodeJS.ProcessEnv;
    const dir = resolveStateDir(env, () => "/home/test");
    expect(normalizeDirForComparison(dir)).toBe("/test/tigerpaw-state");
  });

  it("config paths fall back to openclaw state dir", async () => {
    const { resolveStateDir } = await import("../src/config/paths.js");
    const env = { OPENCLAW_STATE_DIR: "/test/openclaw-state" } as unknown as NodeJS.ProcessEnv;
    const dir = resolveStateDir(env, () => "/home/test");
    expect(normalizeDirForComparison(dir)).toBe("/test/openclaw-state");
  });

  it("plugin manifest loader accepts both tigerpaw.plugin.json and openclaw.plugin.json", async () => {
    const { PLUGIN_MANIFEST_FILENAMES } = await import("../src/plugins/manifest.js");
    expect(PLUGIN_MANIFEST_FILENAMES).toContain("tigerpaw.plugin.json");
    expect(PLUGIN_MANIFEST_FILENAMES).toContain("openclaw.plugin.json");
  });
});
