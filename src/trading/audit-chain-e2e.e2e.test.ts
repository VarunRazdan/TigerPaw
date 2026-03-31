/**
 * Audit chain end-to-end tests.
 *
 * Verify that the audit log maintains a valid SHA-256 hash chain with
 * HMAC tamper evidence across multiple operations, and that chain
 * verification correctly detects corruption.
 */

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

function readHmacKey(): string {
  const envKey = process.env.TIGERPAW_AUDIT_HMAC_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }
  const keyPath = path.join(os.homedir(), ".tigerpaw", "trading", ".audit-hmac-key");
  try {
    return require("node:fs").readFileSync(keyPath, "utf8").trim();
  } catch {
    return "";
  }
}

function hmacSha256(data: string, key: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

async function makeTmpDir(): Promise<string> {
  const base = path.join(
    os.tmpdir(),
    `audit-chain-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  await fs.mkdir(base, { recursive: true });
  return base;
}

function sampleEntry(
  overrides?: Partial<Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac">>,
): Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac"> {
  return {
    extensionId: "ext-e2e",
    action: "order_requested",
    actor: "agent",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("audit-chain E2E: hash chain integrity", () => {
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

  it("records trades and verifies prevHash chain continuity", async () => {
    // Write a sequence of trade audit entries
    await writeAuditEntry(sampleEntry({ action: "order_requested" }));
    await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
    await writeAuditEntry(sampleEntry({ action: "submitted" }));
    await writeAuditEntry(sampleEntry({ action: "filled" }));

    const entries = await readAuditEntries();
    expect(entries).toHaveLength(4);

    // First entry should chain from genesis hash "0"
    expect(entries[0].prevHash).toBe("0");

    // Each subsequent entry's prevHash must be SHA-256 of the previous line
    const content = await fs.readFile(auditFile, "utf8");
    const lines = content.trimEnd().split("\n");
    for (let i = 1; i < entries.length; i++) {
      const expectedHash = sha256(lines[i - 1]);
      expect(entries[i].prevHash).toBe(expectedHash);
    }
  });

  it("verifies HMAC on every entry", async () => {
    await writeAuditEntry(sampleEntry({ action: "order_requested" }));
    await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
    await writeAuditEntry(sampleEntry({ action: "submitted" }));

    const entries = await readAuditEntries();
    const key = readHmacKey();

    for (const entry of entries) {
      expect(entry.hmac).toBeDefined();
      expect(typeof entry.hmac).toBe("string");
      expect(entry.hmac.length).toBe(64);

      // Verify HMAC is correct
      const { hmac: _hmac, ...entryWithoutHmac } = entry;
      const expectedHmac = hmacSha256(JSON.stringify(entryWithoutHmac), key);
      expect(entry.hmac).toBe(expectedHmac);
    }
  });

  it("detects tampered entry (manual corruption test)", async () => {
    await writeAuditEntry(sampleEntry({ action: "order_requested" }));
    await writeAuditEntry(sampleEntry({ action: "auto_approved" }));
    await writeAuditEntry(sampleEntry({ action: "submitted" }));

    // Tamper with the second entry
    const content = await fs.readFile(auditFile, "utf8");
    const lines = content.trimEnd().split("\n");
    const entry1 = JSON.parse(lines[1]) as AuditLogEntry;
    entry1.extensionId = "TAMPERED-EXT";
    // Keep the prevHash and hmac unchanged -- the HMAC should catch this
    lines[1] = JSON.stringify(entry1);
    await fs.writeFile(auditFile, lines.join("\n") + "\n", "utf8");

    const result = await verifyAuditChain(auditFile);
    expect(result.brokenAt).toBe(1);
    expect(result.valid).toBe(1);
  });

  it("audit entries include expected fields", async () => {
    await writeAuditEntry(
      sampleEntry({
        action: "submitted",
        orderSnapshot: {
          id: "ord-123",
          extensionId: "alpaca",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          priceUsd: 150.5,
          notionalUsd: 1505,
          orderType: "market",
        },
      }),
    );

    const entries = await readAuditEntries();
    const entry = entries[0];

    // Required fields
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe("string");
    expect(entry.extensionId).toBe("ext-e2e");
    expect(entry.action).toBe("submitted");
    expect(entry.actor).toBe("agent");
    expect(entry.prevHash).toBeDefined();
    expect(entry.hmac).toBeDefined();

    // Optional order snapshot
    expect(entry.orderSnapshot).toBeDefined();
    expect(entry.orderSnapshot?.symbol).toBe("AAPL");
    expect(entry.orderSnapshot?.quantity).toBe(10);
    expect(entry.orderSnapshot?.priceUsd).toBe(150.5);
  });

  it("chain survives multiple operations across various action types", async () => {
    const actions = [
      "order_requested",
      "auto_approved",
      "submitted",
      "filled",
      "order_requested",
      "denied",
      "order_requested",
      "manually_approved",
      "submitted",
      "cancelled",
    ] as const;

    for (const action of actions) {
      await writeAuditEntry(sampleEntry({ action }));
    }

    const result = await verifyAuditChain(auditFile);
    expect(result.valid).toBe(actions.length);
    expect(result.brokenAt).toBeUndefined();
    expect(result.hmacFailedAt).toBeUndefined();
  });

  it("empty audit file is valid (0 entries)", async () => {
    // Create an empty file
    await fs.writeFile(auditFile, "", "utf8");

    const result = await verifyAuditChain(auditFile);
    expect(result.valid).toBe(0);
    expect(result.brokenAt).toBeUndefined();
  });
});
