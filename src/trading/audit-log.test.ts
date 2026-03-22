import { createHash } from "node:crypto";
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

/** SHA-256 helper matching the source implementation. */
function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Create a unique temporary directory for test isolation. */
async function makeTmpDir(): Promise<string> {
  const base = path.join(
    os.tmpdir(),
    `audit-log-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  await fs.mkdir(base, { recursive: true });
  return base;
}

/** Minimal valid entry (without timestamp / prevHash / hmac, as required by writeAuditEntry). */
function sampleEntry(
  overrides?: Partial<Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac">>,
): Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac"> {
  return {
    extensionId: "ext-test",
    action: "order_requested" as AuditAction,
    actor: "agent" as AuditActor,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("audit-log", () => {
  let tmpDir: string;
  let auditFile: string;

  // Lazily import the module so mocks are in place.
  let configureAuditLog: typeof import("./audit-log.js").configureAuditLog;
  let writeAuditEntry: typeof import("./audit-log.js").writeAuditEntry;
  let verifyAuditChain: typeof import("./audit-log.js").verifyAuditChain;
  let readAuditEntries: typeof import("./audit-log.js").readAuditEntries;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    auditFile = path.join(tmpDir, "audit.jsonl");

    // Dynamic import so mocks are registered before module evaluation.
    const mod = await import("./audit-log.js");
    configureAuditLog = mod.configureAuditLog;
    writeAuditEntry = mod.writeAuditEntry;
    verifyAuditChain = mod.verifyAuditChain;
    readAuditEntries = mod.readAuditEntries;

    // Reset module-level mutable state for each test.
    configureAuditLog({ filePath: auditFile });
  });

  afterEach(async () => {
    // Clean up temp directory.
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // writeAuditEntry
  // -----------------------------------------------------------------------

  describe("writeAuditEntry", () => {
    it("creates the parent directory if it does not exist", async () => {
      const nested = path.join(tmpDir, "a", "b", "c", "audit.jsonl");
      configureAuditLog({ filePath: nested });

      await writeAuditEntry(sampleEntry());

      const stat = await fs.stat(path.dirname(nested));
      expect(stat.isDirectory()).toBe(true);
    });

    it("appends a single JSONL line with expected fields", async () => {
      await writeAuditEntry(sampleEntry());

      const content = await fs.readFile(auditFile, "utf8");
      const lines = content.trimEnd().split("\n");
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]) as AuditLogEntry;
      expect(parsed.extensionId).toBe("ext-test");
      expect(parsed.action).toBe("order_requested");
      expect(parsed.actor).toBe("agent");
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.prevHash).toBe("0"); // First entry in a fresh chain.
    });

    it("sets file permissions to 0o600", async () => {
      await writeAuditEntry(sampleEntry());

      const stat = await fs.stat(auditFile);
      // mode & 0o777 extracts the permission bits.
      const perms = stat.mode & 0o777;
      expect(perms).toBe(0o600);
    });

    it("includes optional fields when provided", async () => {
      await writeAuditEntry(
        sampleEntry({
          error: "something went wrong",
        }),
      );

      const entries = await readAuditEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].error).toBe("something went wrong");
    });

    it("never throws even when the file system operation fails", async () => {
      // Point to an invalid path on a non-existent device-like prefix.
      configureAuditLog({ filePath: "/dev/null/impossible/audit.jsonl" });

      // Should not throw.
      await expect(writeAuditEntry(sampleEntry())).resolves.toBeUndefined();
    });

    it("writes a valid ISO-8601 timestamp", async () => {
      await writeAuditEntry(sampleEntry());

      const entries = await readAuditEntries();
      const ts = entries[0].timestamp;
      // ISO-8601 timestamps parse to a valid date.
      expect(Number.isNaN(Date.parse(ts))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Hash chain integrity
  // -----------------------------------------------------------------------

  describe("hash chain", () => {
    it("first entry has prevHash '0'", async () => {
      await writeAuditEntry(sampleEntry());

      const entries = await readAuditEntries();
      expect(entries[0].prevHash).toBe("0");
    });

    it("subsequent entries link to the SHA-256 of the previous line", async () => {
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
      await writeAuditEntry(sampleEntry({ action: "submitted" }));

      const content = await fs.readFile(auditFile, "utf8");
      const lines = content.trimEnd().split("\n");
      expect(lines).toHaveLength(3);

      const entry0 = JSON.parse(lines[0]) as AuditLogEntry;
      const entry1 = JSON.parse(lines[1]) as AuditLogEntry;
      const entry2 = JSON.parse(lines[2]) as AuditLogEntry;

      expect(entry0.prevHash).toBe("0");
      expect(entry1.prevHash).toBe(sha256(lines[0]));
      expect(entry2.prevHash).toBe(sha256(lines[1]));
    });

    it("chain survives across multiple sequential writes", async () => {
      for (let i = 0; i < 5; i++) {
        await writeAuditEntry(sampleEntry({ extensionId: `ext-${i}` }));
      }

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 5 });
    });
  });

  // -----------------------------------------------------------------------
  // verifyAuditChain
  // -----------------------------------------------------------------------

  describe("verifyAuditChain", () => {
    it("returns {valid: 0} for a missing file", async () => {
      const result = await verifyAuditChain(path.join(tmpDir, "nonexistent.jsonl"));
      expect(result).toEqual({ valid: 0 });
    });

    it("returns {valid: 0} for an empty file", async () => {
      await fs.writeFile(auditFile, "", "utf8");
      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 0 });
    });

    it("returns {valid: N} for a valid chain of N entries", async () => {
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
      await writeAuditEntry(sampleEntry({ action: "filled" }));

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 3 });
    });

    it("detects a broken chain and returns brokenAt index", async () => {
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
      await writeAuditEntry(sampleEntry({ action: "submitted" }));

      // Tamper with the second line to break the chain.
      const content = await fs.readFile(auditFile, "utf8");
      const lines = content.trimEnd().split("\n");
      const tampered = JSON.parse(lines[1]) as AuditLogEntry;
      tampered.extensionId = "tampered-value";
      lines[1] = JSON.stringify(tampered);
      await fs.writeFile(auditFile, lines.join("\n") + "\n", "utf8");

      const result = await verifyAuditChain();
      // Line 0 is valid. Line 1 is tampered: its HMAC was computed from the
      // original content, so HMAC verification catches the tampering at line 1.
      expect(result.brokenAt).toBe(1);
      expect(result.valid).toBe(1);
    });

    it("detects corruption at the very first entry", async () => {
      // Manually write an entry whose prevHash is not "0".
      const badEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        extensionId: "ext-bad",
        action: "order_requested",
        actor: "agent",
        prevHash: "not-zero",
        hmac: "bogus",
      };
      await fs.writeFile(auditFile, JSON.stringify(badEntry) + "\n", "utf8");

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 0, brokenAt: 0 });
    });

    it("detects malformed JSON as a broken link", async () => {
      await writeAuditEntry(sampleEntry());

      const content = await fs.readFile(auditFile, "utf8");
      await fs.writeFile(auditFile, content + "this is not json\n", "utf8");

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 1, brokenAt: 1 });
    });

    it("accepts an explicit filePath argument", async () => {
      const otherFile = path.join(tmpDir, "other-audit.jsonl");
      configureAuditLog({ filePath: otherFile });

      await writeAuditEntry(sampleEntry());
      await writeAuditEntry(sampleEntry());

      // Verify using the explicit path instead of relying on config.
      const result = await verifyAuditChain(otherFile);
      expect(result).toEqual({ valid: 2 });
    });
  });

  // -----------------------------------------------------------------------
  // readAuditEntries
  // -----------------------------------------------------------------------

  describe("readAuditEntries", () => {
    it("returns an empty array for a missing file", async () => {
      const entries = await readAuditEntries(path.join(tmpDir, "does-not-exist.jsonl"));
      expect(entries).toEqual([]);
    });

    it("returns an empty array for an empty file", async () => {
      await fs.writeFile(auditFile, "", "utf8");
      const entries = await readAuditEntries();
      expect(entries).toEqual([]);
    });

    it("returns parsed entries from the file", async () => {
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "denied" }));

      const entries = await readAuditEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].action).toBe("order_requested");
      expect(entries[1].action).toBe("denied");
    });

    it("skips malformed JSON lines without throwing", async () => {
      await writeAuditEntry(sampleEntry());

      // Append a malformed line.
      await fs.appendFile(auditFile, "not-json\n", "utf8");

      await writeAuditEntry(sampleEntry({ action: "filled" }));

      // The malformed line is skipped; the two valid entries are returned.
      // Note: the third writeAuditEntry after the manual append will have a
      // prevHash based on the cached last hash, not the malformed line.
      const entries = await readAuditEntries();
      // We get the first entry and the third (malformed line is skipped).
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[0].action).toBe("order_requested");
    });

    it("accepts an explicit filePath argument", async () => {
      const otherFile = path.join(tmpDir, "custom.jsonl");
      configureAuditLog({ filePath: otherFile });

      await writeAuditEntry(sampleEntry({ extensionId: "custom-ext" }));

      const entries = await readAuditEntries(otherFile);
      expect(entries).toHaveLength(1);
      expect(entries[0].extensionId).toBe("custom-ext");
    });
  });

  // -----------------------------------------------------------------------
  // configureAuditLog
  // -----------------------------------------------------------------------

  describe("configureAuditLog", () => {
    it("resets the cached hash so a subsequent write re-reads the chain tail", async () => {
      // Write two entries to build a chain.
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));

      // Reconfigure with the same file -- this resets lastEntryHash.
      configureAuditLog({ filePath: auditFile });

      // The next write should re-read the file to find the last hash,
      // producing a valid chain continuation (not starting from "0").
      await writeAuditEntry(sampleEntry({ action: "submitted" }));

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 3 });
    });

    it("changes the target file path", async () => {
      const newFile = path.join(tmpDir, "new-audit.jsonl");
      configureAuditLog({ filePath: newFile });

      await writeAuditEntry(sampleEntry());

      const entries = await readAuditEntries(newFile);
      expect(entries).toHaveLength(1);
    });

    it("applies maxFileSizeMb configuration", async () => {
      // Configure with a very small max size to trigger rotation quickly.
      configureAuditLog({ filePath: auditFile, maxFileSizeMb: 0 });

      // Write an entry; with 0 MB limit the file should rotate immediately
      // after the first write (on the second write attempt).
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));

      // After rotation, the original file was renamed to .1
      const rotatedExists = await fs
        .stat(`${auditFile}.1`)
        .then(() => true)
        .catch(() => false);
      expect(rotatedExists).toBe(true);
    });

    it("applies rotateCount configuration", async () => {
      configureAuditLog({
        filePath: auditFile,
        maxFileSizeMb: 0, // Force rotation on every write.
        rotateCount: 2,
      });

      // Write enough entries to cause multiple rotations.
      for (let i = 0; i < 4; i++) {
        await writeAuditEntry(sampleEntry({ extensionId: `ext-${i}` }));
      }

      // With rotateCount=2, at most .1 and .2 should exist.
      const exists1 = await fs
        .stat(`${auditFile}.1`)
        .then(() => true)
        .catch(() => false);
      const exists2 = await fs
        .stat(`${auditFile}.2`)
        .then(() => true)
        .catch(() => false);
      expect(exists1).toBe(true);
      expect(exists2).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Log rotation
  // -----------------------------------------------------------------------

  describe("rotation", () => {
    it("rotates the file when it exceeds maxBytes", async () => {
      configureAuditLog({ filePath: auditFile, maxFileSizeMb: 0 });

      await writeAuditEntry(sampleEntry({ action: "order_requested" }));

      // First write creates the file. Second write triggers rotation because
      // the file size exceeds 0 bytes.
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));

      const rotatedExists = await fs
        .stat(`${auditFile}.1`)
        .then(() => true)
        .catch(() => false);
      expect(rotatedExists).toBe(true);

      // The primary file should contain the latest entry.
      const entries = await readAuditEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it("shifts older rotations (audit.jsonl.1 -> .2, etc.)", async () => {
      configureAuditLog({
        filePath: auditFile,
        maxFileSizeMb: 0,
        rotateCount: 3,
      });

      // Write enough entries to cause cascading rotations.
      for (let i = 0; i < 5; i++) {
        await writeAuditEntry(sampleEntry({ extensionId: `ext-${i}` }));
      }

      // At least .1 should exist from cascading shifts.
      const exists1 = await fs
        .stat(`${auditFile}.1`)
        .then(() => true)
        .catch(() => false);
      expect(exists1).toBe(true);
    });

    it("resets the cached hash after rotation so new chain starts at '0'", async () => {
      configureAuditLog({ filePath: auditFile, maxFileSizeMb: 0 });

      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      // This triggers rotation, then writes to the now-empty primary file.
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));

      // The new primary file should have a valid chain (starting from "0").
      const result = await verifyAuditChain();
      expect(result.brokenAt).toBeUndefined();
    });

    it("does not rotate when file size is under the limit", async () => {
      // 50 MB default -- our tiny test entries won't exceed this.
      configureAuditLog({ filePath: auditFile });

      await writeAuditEntry(sampleEntry());
      await writeAuditEntry(sampleEntry());

      const rotatedExists = await fs
        .stat(`${auditFile}.1`)
        .then(() => true)
        .catch(() => false);
      expect(rotatedExists).toBe(false);
    });

    it("handles rotation when rotated files do not already exist", async () => {
      configureAuditLog({
        filePath: auditFile,
        maxFileSizeMb: 0,
        rotateCount: 5,
      });

      // First call -- no .1, .2, etc. exist yet.
      await writeAuditEntry(sampleEntry());
      await writeAuditEntry(sampleEntry());

      // Should not throw and rotation file should be created.
      const rotatedExists = await fs
        .stat(`${auditFile}.1`)
        .then(() => true)
        .catch(() => false);
      expect(rotatedExists).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles concurrent configureAuditLog + writeAuditEntry gracefully", async () => {
      // Write one entry, reconfigure mid-stream, write another.
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      configureAuditLog({ filePath: auditFile });
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));

      // The chain should still be valid because reconfigure triggers
      // a re-read of the last hash from the file.
      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 2 });
    });

    it("handles all AuditAction values", async () => {
      const actions: AuditAction[] = [
        "order_requested",
        "auto_approved",
        "manually_approved",
        "denied",
        "submitted",
        "filled",
        "rejected",
        "cancelled",
        "kill_switch_activated",
        "limit_exceeded",
        "policy_changed",
      ];

      for (const action of actions) {
        await writeAuditEntry(sampleEntry({ action }));
      }

      const entries = await readAuditEntries();
      expect(entries).toHaveLength(actions.length);
      expect(entries.map((e) => e.action)).toEqual(actions);
    });

    it("handles all AuditActor values", async () => {
      const actors: AuditActor[] = ["agent", "operator", "system"];

      for (const actor of actors) {
        await writeAuditEntry(sampleEntry({ actor }));
      }

      const entries = await readAuditEntries();
      expect(entries).toHaveLength(actors.length);
      expect(entries.map((e) => e.actor)).toEqual(actors);
    });

    it("preserves entries across multiple reads", async () => {
      await writeAuditEntry(sampleEntry({ extensionId: "ext-a" }));
      await writeAuditEntry(sampleEntry({ extensionId: "ext-b" }));

      const first = await readAuditEntries();
      const second = await readAuditEntries();
      expect(first).toEqual(second);
    });

    it("writeAuditEntry returns undefined on success", async () => {
      const result = await writeAuditEntry(sampleEntry());
      expect(result).toBeUndefined();
    });
  });
});
