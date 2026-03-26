import { createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogEntry } from "./audit-log.js";

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

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Read the HMAC key that the module persists to disk.
 * The module always stores the key at ~/.tigerpaw/trading/.audit-hmac-key
 * regardless of the configured audit file path.
 * Falls back to TIGERPAW_AUDIT_HMAC_KEY env var if set.
 */
function readHmacKey(): string {
  const envKey = process.env.TIGERPAW_AUDIT_HMAC_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }
  const keyPath = path.join(os.homedir(), ".tigerpaw", "trading", ".audit-hmac-key");
  try {
    return require("node:fs").readFileSync(keyPath, "utf8").trim();
  } catch {
    // Key hasn't been created yet — will be created on first write.
    return "";
  }
}

function hmacSha256(data: string, key: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

async function makeTmpDir(): Promise<string> {
  const base = path.join(
    os.tmpdir(),
    `audit-hmac-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  await fs.mkdir(base, { recursive: true });
  return base;
}

function sampleEntry(
  overrides?: Partial<Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac">>,
): Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac"> {
  return {
    extensionId: "ext-test",
    action: "order_requested",
    actor: "agent",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("audit-log HMAC chain verification", () => {
  let tmpDir: string;
  let auditFile: string;

  let configureAuditLog: typeof import("./audit-log.js").configureAuditLog;
  let writeAuditEntry: typeof import("./audit-log.js").writeAuditEntry;
  let verifyAuditChain: typeof import("./audit-log.js").verifyAuditChain;
  let readAuditEntries: typeof import("./audit-log.js").readAuditEntries;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    auditFile = path.join(tmpDir, "audit.jsonl");

    const mod = await import("./audit-log.js");
    configureAuditLog = mod.configureAuditLog;
    writeAuditEntry = mod.writeAuditEntry;
    verifyAuditChain = mod.verifyAuditChain;
    readAuditEntries = mod.readAuditEntries;

    configureAuditLog({ filePath: auditFile });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // HMAC field presence
  // -----------------------------------------------------------------------
  describe("HMAC field presence", () => {
    it("every written entry includes an hmac field", async () => {
      await writeAuditEntry(sampleEntry());
      await writeAuditEntry(sampleEntry({ action: "filled" }));
      await writeAuditEntry(sampleEntry({ action: "denied" }));

      const entries = await readAuditEntries();
      for (const entry of entries) {
        expect(entry.hmac).toBeDefined();
        expect(typeof entry.hmac).toBe("string");
        expect(entry.hmac.length).toBe(64); // SHA-256 hex = 64 chars
      }
    });

    it("HMAC is computed from the entry content without the hmac field", async () => {
      await writeAuditEntry(sampleEntry());

      const entries = await readAuditEntries();
      const entry = entries[0];

      // Reconstruct the HMAC input: entry without hmac field
      const { hmac: _hmac, ...entryWithoutHmac } = entry;
      const key = readHmacKey();
      expect(key.length).toBeGreaterThan(0);
      const expectedHmac = hmacSha256(JSON.stringify(entryWithoutHmac), key);
      expect(entry.hmac).toBe(expectedHmac);
    });
  });

  // -----------------------------------------------------------------------
  // Chain + HMAC verification
  // -----------------------------------------------------------------------
  describe("chain + HMAC verification", () => {
    it("valid chain with HMAC passes verification", async () => {
      for (let i = 0; i < 10; i++) {
        await writeAuditEntry(sampleEntry({ extensionId: `ext-${i}` }));
      }

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 10 });
      expect(result.brokenAt).toBeUndefined();
      expect(result.hmacFailedAt).toBeUndefined();
    });

    it("detects tampered entry via HMAC failure", async () => {
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
      await writeAuditEntry(sampleEntry({ action: "submitted" }));

      // Read file and tamper with entry 1's extensionId
      const content = await fs.readFile(auditFile, "utf8");
      const lines = content.trimEnd().split("\n");
      const entry1 = JSON.parse(lines[1]) as AuditLogEntry;
      entry1.extensionId = "TAMPERED";
      // Re-serialize without updating the HMAC
      lines[1] = JSON.stringify(entry1);
      await fs.writeFile(auditFile, lines.join("\n") + "\n", "utf8");

      const result = await verifyAuditChain();
      expect(result.hmacFailedAt).toBe(1);
      expect(result.brokenAt).toBe(1);
      expect(result.valid).toBe(1);
    });

    it("detects tampered entry even when prevHash is re-calculated", async () => {
      await writeAuditEntry(sampleEntry({ action: "order_requested" }));
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));

      const content = await fs.readFile(auditFile, "utf8");
      const lines = content.trimEnd().split("\n");
      const entry1 = JSON.parse(lines[1]) as AuditLogEntry;

      // Fix the prevHash to match the actual previous line hash,
      // but the HMAC is still wrong because we changed content
      entry1.extensionId = "TAMPERED";
      entry1.prevHash = sha256(lines[0]); // "fix" the prevHash
      lines[1] = JSON.stringify(entry1);
      await fs.writeFile(auditFile, lines.join("\n") + "\n", "utf8");

      const result = await verifyAuditChain();
      // prevHash check passes but HMAC catches the tampering
      expect(result.hmacFailedAt).toBe(1);
    });

    it("accepts entries without HMAC (backward compatibility)", async () => {
      // Write entries that look like pre-HMAC format (no hmac field)
      const entry0: Omit<AuditLogEntry, "hmac"> = {
        timestamp: new Date().toISOString(),
        extensionId: "ext-legacy",
        action: "order_requested",
        actor: "agent",
        prevHash: "0",
      };
      const line0 = JSON.stringify(entry0);

      const entry1: Omit<AuditLogEntry, "hmac"> = {
        timestamp: new Date().toISOString(),
        extensionId: "ext-legacy",
        action: "filled",
        actor: "agent",
        prevHash: sha256(line0),
      };
      const line1 = JSON.stringify(entry1);

      await fs.writeFile(auditFile, `${line0}\n${line1}\n`, "utf8");

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 2 });
    });
  });

  // -----------------------------------------------------------------------
  // Mixed old/new entries
  // -----------------------------------------------------------------------
  describe("mixed old and new format entries", () => {
    it("validates chain with legacy entries followed by HMAC entries", async () => {
      // Write a legacy entry (no hmac)
      const legacyEntry: Omit<AuditLogEntry, "hmac"> = {
        timestamp: new Date().toISOString(),
        extensionId: "ext-legacy",
        action: "order_requested",
        actor: "agent",
        prevHash: "0",
      };
      const legacyLine = JSON.stringify(legacyEntry);
      await fs.writeFile(auditFile, `${legacyLine}\n`, "utf8");

      // Reset the cache and configure
      configureAuditLog({ filePath: auditFile });

      // Write new-format entries on top
      await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
      await writeAuditEntry(sampleEntry({ action: "filled" }));

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 3 });
    });
  });

  // -----------------------------------------------------------------------
  // Large chain verification
  // -----------------------------------------------------------------------
  describe("large chain", () => {
    it("verifies a chain of 100 entries", async () => {
      for (let i = 0; i < 100; i++) {
        await writeAuditEntry(sampleEntry({ extensionId: `ext-${i % 10}` }));
      }

      const result = await verifyAuditChain();
      expect(result).toEqual({ valid: 100 });
    });
  });

  // -----------------------------------------------------------------------
  // HMAC with different entry types
  // -----------------------------------------------------------------------
  describe("HMAC with various entry content", () => {
    it("includes orderSnapshot in HMAC computation", async () => {
      await writeAuditEntry(
        sampleEntry({
          action: "submitted",
          orderSnapshot: {
            id: "ord-1",
            extensionId: "alpaca",
            symbol: "AAPL",
            side: "buy",
            quantity: 10,
            priceUsd: 150,
            notionalUsd: 1500,
            orderType: "market",
          },
        }),
      );

      const entries = await readAuditEntries();
      const entry = entries[0];
      const { hmac: _hmac, ...withoutHmac } = entry;
      const key = readHmacKey();
      expect(entry.hmac).toBe(hmacSha256(JSON.stringify(withoutHmac), key));
    });

    it("includes error field in HMAC computation", async () => {
      await writeAuditEntry(
        sampleEntry({
          action: "denied",
          error: "risk limit exceeded: daily spend $500 > $100",
        }),
      );

      const entries = await readAuditEntries();
      const entry = entries[0];
      const { hmac: _hmac, ...withoutHmac } = entry;
      const key = readHmacKey();
      expect(entry.hmac).toBe(hmacSha256(JSON.stringify(withoutHmac), key));
    });
  });
});
