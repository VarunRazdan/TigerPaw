import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditAction, AuditActor, AuditLogEntry } from "./audit-log.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../plugin-sdk/file-lock.js", () => ({
  withFileLock: vi.fn(
    async (_filePath: string, _opts: unknown, fn: () => Promise<unknown>): Promise<unknown> => fn(),
  ),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  const base = path.join(
    os.tmpdir(),
    `audit-rotation-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  await fs.mkdir(base, { recursive: true });
  return base;
}

function sampleEntry(
  overrides?: Partial<Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac">>,
): Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac"> {
  return {
    extensionId: "ext-rotation-test",
    action: "order_requested" as AuditAction,
    actor: "agent" as AuditActor,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("audit-log chain verification", () => {
  let tmpDir: string;
  let auditFile: string;

  let configureAuditLog: typeof import("./audit-log.js").configureAuditLog;
  let writeAuditEntry: typeof import("./audit-log.js").writeAuditEntry;
  let readAuditEntries: typeof import("./audit-log.js").readAuditEntries;
  let verifyAuditChain: typeof import("./audit-log.js").verifyAuditChain;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    auditFile = path.join(tmpDir, "audit.jsonl");

    const mod = await import("./audit-log.js");
    configureAuditLog = mod.configureAuditLog;
    writeAuditEntry = mod.writeAuditEntry;
    readAuditEntries = mod.readAuditEntries;
    verifyAuditChain = mod.verifyAuditChain;

    configureAuditLog({ filePath: auditFile });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("verifyAuditChain validates a correct chain", async () => {
    await writeAuditEntry(sampleEntry({ action: "order_requested" }));
    await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
    await writeAuditEntry(sampleEntry({ action: "filled" }));

    const entries = await readAuditEntries();
    expect(entries).toHaveLength(3);

    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: 3 });
    expect(result.brokenAt).toBeUndefined();
  });

  it("verifyAuditChain detects tampered entries", async () => {
    await writeAuditEntry(sampleEntry({ action: "order_requested" }));
    await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
    await writeAuditEntry(sampleEntry({ action: "submitted" }));

    // Tamper with the second entry on disk.
    const content = await fs.readFile(auditFile, "utf8");
    const lines = content.trimEnd().split("\n");

    const tampered = JSON.parse(lines[1]) as AuditLogEntry;
    tampered.extensionId = "tampered-extension";
    lines[1] = JSON.stringify(tampered);
    await fs.writeFile(auditFile, lines.join("\n") + "\n", "utf8");

    const result = await verifyAuditChain();

    // The tampered line's HMAC no longer matches, so verification fails at index 1.
    expect(result.brokenAt).toBe(1);
    expect(result.valid).toBe(1);
  });
});
