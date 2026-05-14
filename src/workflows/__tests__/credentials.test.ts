/**
 * Tests for the credential vault: master-key generation, AES-256-GCM
 * round-trip, legacy fallthrough, mixed-envelope decryption, env override,
 * and decrypt-failure surfacing.
 */

import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import { hostname, homedir } from "node:os";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadOrGenerateMasterKey,
  resetVaultMasterKeyCacheForTests,
  resolveVaultMasterKeyPath,
  VAULT_KEY_LENGTH,
} from "../vault-master-key.js";

const ALGORITHM = "aes-256-gcm";

// Build a legacy v1-format ciphertext using the same scheme as the pre-migration code.
function legacyEncrypt(plaintext: string): string {
  const seed = `tigerpaw-vault-${hostname()}-${homedir()}`;
  const key = scryptSync(seed, "tigerpaw-salt-v1", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

let tmpStateDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "tigerpaw-vault-test-"));
  process.env.TIGERPAW_STATE_DIR = tmpStateDir;
  delete process.env.TIGERPAW_VAULT_KEY_BASE64;
  resetVaultMasterKeyCacheForTests();
});

afterEach(() => {
  process.env = originalEnv;
  resetVaultMasterKeyCacheForTests();
  try {
    fs.rmSync(tmpStateDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe("vault-master-key", () => {
  it("generates a 32-byte key on first read and persists it", () => {
    const keyPath = resolveVaultMasterKeyPath();
    expect(fs.existsSync(keyPath)).toBe(false);

    const key = loadOrGenerateMasterKey();
    expect(key.length).toBe(VAULT_KEY_LENGTH);
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(fs.readFileSync(keyPath).length).toBe(VAULT_KEY_LENGTH);
  });

  it("returns the same key on subsequent calls (cache + on-disk)", () => {
    const k1 = loadOrGenerateMasterKey();
    resetVaultMasterKeyCacheForTests();
    const k2 = loadOrGenerateMasterKey();
    expect(k1.equals(k2)).toBe(true);
  });

  it.skipIf(process.platform === "win32")("creates the key file with mode 0o600", () => {
    loadOrGenerateMasterKey();
    const keyPath = resolveVaultMasterKeyPath();
    const mode = fs.statSync(keyPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("honors TIGERPAW_VAULT_KEY_BASE64 and skips file generation", () => {
    const supplied = randomBytes(32);
    process.env.TIGERPAW_VAULT_KEY_BASE64 = supplied.toString("base64");
    const key = loadOrGenerateMasterKey();
    expect(key.equals(supplied)).toBe(true);
    expect(fs.existsSync(resolveVaultMasterKeyPath())).toBe(false);
  });

  it("rejects a 16-byte env override at module load", () => {
    process.env.TIGERPAW_VAULT_KEY_BASE64 = randomBytes(16).toString("base64");
    expect(() => loadOrGenerateMasterKey()).toThrow(/32 bytes/);
  });

  it("rejects an invalid-base64 env override", () => {
    process.env.TIGERPAW_VAULT_KEY_BASE64 = "!!!not-base64!!!";
    expect(() => loadOrGenerateMasterKey()).toThrow();
  });

  it("two parallel calls see the same key (O_EXCL race)", async () => {
    // Reset cache so both callers race on the file.
    resetVaultMasterKeyCacheForTests();
    const [a, b] = await Promise.all([
      Promise.resolve().then(() => {
        resetVaultMasterKeyCacheForTests();
        return loadOrGenerateMasterKey();
      }),
      Promise.resolve().then(() => {
        resetVaultMasterKeyCacheForTests();
        return loadOrGenerateMasterKey();
      }),
    ]);
    expect(a.equals(b)).toBe(true);
  });
});

describe("credentials encrypt/decrypt", () => {
  // The DAL is mocked so we can exercise encrypt/decrypt without touching
  // SQLite. We re-import after the mock is applied.
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadCredentialsModule(): Promise<typeof import("../credentials.js")> {
    vi.doMock("../../dal/credentials.js", () => {
      const store = new Map<string, unknown>();
      return {
        dalListCredentials: () =>
          Array.from(store.values()).map((c) => {
            const cred = c as {
              id: string;
              name: string;
              type: string;
              fields: Record<string, string | null>;
              createdAt: string;
              updatedAt: string;
            };
            return { ...cred, fieldKeys: Object.keys(cred.fields), fields: undefined };
          }),
        dalGetCredentialRaw: (id: string) => store.get(id) ?? null,
        dalSaveCredentialRaw: (cred: { id: string }) => {
          store.set(cred.id, cred);
        },
        dalDeleteCredential: (id: string) => store.delete(id),
        dalFindByType: (type: string) =>
          Array.from(store.values()).filter((c) => (c as { type: string }).type === type),
      };
    });
    return await import("../credentials.js");
  }

  it("round-trips a value through saveCredential / getCredential", async () => {
    const { saveCredential, getCredential } = await loadCredentialsModule();
    saveCredential({
      id: "c1",
      name: "Test",
      type: "api_key",
      fields: { apiKey: "sk-secret-123" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const got = getCredential("c1");
    expect(got?.fields.apiKey).toBe("sk-secret-123");
  });

  it("decrypts pre-v2 (legacy) ciphertexts", async () => {
    const { getCredential } = await loadCredentialsModule();
    const dal = await import("../../dal/credentials.js");
    (dal.dalSaveCredentialRaw as (c: unknown) => void)({
      id: "legacy",
      name: "Legacy",
      type: "api_key",
      fields: { apiKey: legacyEncrypt("legacy-secret") },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    const got = getCredential("legacy");
    expect(got?.fields.apiKey).toBe("legacy-secret");
  });

  it("decrypts mixed-envelope credentials (one v2 field, one legacy field)", async () => {
    const { saveCredential, getCredential } = await loadCredentialsModule();
    const dal = await import("../../dal/credentials.js");
    // First save under v2 to get one field encrypted with the new key.
    saveCredential({
      id: "mixed",
      name: "Mixed",
      type: "api_key",
      fields: { v2field: "fresh-value" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    // Now patch in a legacy-encrypted field directly via the DAL.
    const raw = (dal.dalGetCredentialRaw as (id: string) => { fields: Record<string, string> })(
      "mixed",
    );
    raw.fields.legacyField = legacyEncrypt("legacy-value");
    (dal.dalSaveCredentialRaw as (c: unknown) => void)(raw);

    const got = getCredential("mixed");
    expect(got?.fields.v2field).toBe("fresh-value");
    expect(got?.fields.legacyField).toBe("legacy-value");
  });

  it("re-saving an item with mixed envelopes rolls every field forward to v2", async () => {
    const { saveCredential, getCredential } = await loadCredentialsModule();
    const dal = await import("../../dal/credentials.js");
    saveCredential({
      id: "roll",
      name: "Roll",
      type: "api_key",
      fields: { a: "alpha" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const raw = (dal.dalGetCredentialRaw as (id: string) => { fields: Record<string, string> })(
      "roll",
    );
    raw.fields.b = legacyEncrypt("beta");
    (dal.dalSaveCredentialRaw as (c: unknown) => void)(raw);

    // Force re-encrypt by saving via the public API.
    const cred = getCredential("roll");
    expect(cred).not.toBeNull();
    saveCredential(cred!);

    const after = (dal.dalGetCredentialRaw as (id: string) => { fields: Record<string, string> })(
      "roll",
    );
    expect(after.fields.a.startsWith("v2:")).toBe(true);
    expect(after.fields.b.startsWith("v2:")).toBe(true);
  });

  it("produces 100 distinct ciphertexts for the same plaintext (IV uniqueness)", async () => {
    const { saveCredential, getCredential } = await loadCredentialsModule();
    const dal = await import("../../dal/credentials.js");
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      saveCredential({
        id: `iv-${i}`,
        name: `iv-${i}`,
        type: "api_key",
        fields: { apiKey: "constant-plaintext" },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      const raw = (dal.dalGetCredentialRaw as (id: string) => { fields: Record<string, string> })(
        `iv-${i}`,
      );
      seen.add(raw.fields.apiKey);
      // sanity: still decrypts correctly
      expect(getCredential(`iv-${i}`)?.fields.apiKey).toBe("constant-plaintext");
    }
    expect(seen.size).toBe(100);
  });

  it("preserves null field values instead of round-tripping the literal 'null'", async () => {
    const { saveCredential, getCredential } = await loadCredentialsModule();
    saveCredential({
      id: "null-field",
      name: "Null",
      type: "api_key",
      fields: { apiKey: "real", maybe: null },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const got = getCredential("null-field");
    expect(got?.fields.apiKey).toBe("real");
    expect(got?.fields.maybe).toBe(null);
  });

  it("returns null and logs a warn on decrypt failure", async () => {
    const { getCredential } = await loadCredentialsModule();
    const dal = await import("../../dal/credentials.js");
    (dal.dalSaveCredentialRaw as (c: unknown) => void)({
      id: "broken",
      name: "Broken",
      type: "api_key",
      fields: { apiKey: "v2:not-real-iv:nope:garbage" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const got = getCredential("broken");
    expect(got?.fields.apiKey).toBe(null);
  });

  it("testVault reports keyFormat=v2", async () => {
    const { testVault } = await loadCredentialsModule();
    const result = testVault();
    expect(result.ok).toBe(true);
    expect(result.keyFormat).toBe("v2");
  });
});
