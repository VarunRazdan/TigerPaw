/**
 * Tests for Ed25519 extension signature verification.
 */

import crypto from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { verifyExtensionSignature, addTrustedKey, hasTrustedKeys } from "./signature-verify.js";

// Generate a fresh Ed25519 key pair for testing.
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

const TEST_KEY_ID = "test-key";

function signManifest(manifest: Record<string, unknown>): string {
  const cleaned = { ...manifest };
  delete cleaned.signature;
  const canonical = JSON.stringify(cleaned, Object.keys(cleaned).toSorted());
  const digest = crypto.createHash("sha256").update(canonical, "utf8").digest();
  const sig = crypto.sign(null, digest, privateKey);
  return sig.toString("base64");
}

describe("verifyExtensionSignature", () => {
  beforeEach(() => {
    addTrustedKey(TEST_KEY_ID, publicKeyPem);
  });

  it("returns signed:false for unsigned manifests", () => {
    const result = verifyExtensionSignature({ name: "test-ext", version: "1.0.0" });
    expect(result.signed).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("returns error for unknown key ID", () => {
    const manifest = {
      name: "test-ext",
      version: "1.0.0",
      signature: { keyId: "unknown-key", value: "abc123" },
    };
    const result = verifyExtensionSignature(manifest);
    expect(result.signed).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.error).toContain("unknown key ID");
  });

  it("verifies a valid Ed25519 signature", () => {
    const manifest: Record<string, unknown> = {
      name: "test-ext",
      version: "1.0.0",
      permissions: ["network"],
    };
    const sigValue = signManifest(manifest);
    manifest.signature = { keyId: TEST_KEY_ID, value: sigValue };

    const result = verifyExtensionSignature(manifest);
    expect(result.signed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.keyId).toBe(TEST_KEY_ID);
    expect(result.error).toBeUndefined();
  });

  it("rejects a tampered manifest", () => {
    const manifest: Record<string, unknown> = {
      name: "test-ext",
      version: "1.0.0",
    };
    const sigValue = signManifest(manifest);
    // Tamper after signing
    manifest.version = "2.0.0";
    manifest.signature = { keyId: TEST_KEY_ID, value: sigValue };

    const result = verifyExtensionSignature(manifest);
    expect(result.signed).toBe(true);
    expect(result.verified).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const { privateKey: otherKey } = crypto.generateKeyPairSync("ed25519");
    const manifest: Record<string, unknown> = { name: "test-ext", version: "1.0.0" };
    const cleaned = { ...manifest };
    const canonical = JSON.stringify(cleaned, Object.keys(cleaned).toSorted());
    const digest = crypto.createHash("sha256").update(canonical, "utf8").digest();
    const wrongSig = crypto.sign(null, digest, otherKey).toString("base64");

    manifest.signature = { keyId: TEST_KEY_ID, value: wrongSig };
    const result = verifyExtensionSignature(manifest);
    expect(result.signed).toBe(true);
    expect(result.verified).toBe(false);
  });

  it("handles malformed signature gracefully", () => {
    const manifest = {
      name: "test-ext",
      version: "1.0.0",
      signature: { keyId: TEST_KEY_ID, value: "not-valid-base64!!!" },
    };
    const result = verifyExtensionSignature(manifest);
    expect(result.signed).toBe(true);
    expect(result.verified).toBe(false);
  });
});

describe("hasTrustedKeys", () => {
  it("returns true when keys are registered", () => {
    addTrustedKey("some-key", publicKeyPem);
    expect(hasTrustedKeys()).toBe(true);
  });
});
