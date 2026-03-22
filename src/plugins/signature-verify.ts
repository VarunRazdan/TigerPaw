/**
 * Optional Ed25519 signature verification for Tigerpaw extensions.
 *
 * Extensions can include a signature in their manifest. Unsigned extensions
 * load normally but get an "unverified" badge in the UI.
 *
 * Signature is Ed25519 over SHA-256 of the manifest JSON (minus the signature field).
 */

import crypto, { createHash } from "node:crypto";

export type SignatureVerifyResult = {
  signed: boolean;
  verified: boolean;
  keyId?: string;
  error?: string;
};

/**
 * Trusted public keys for extension verification.
 * Keys are Ed25519 public keys in PEM format, keyed by ID.
 */
const TRUSTED_KEYS: Record<string, string> = {
  // Placeholder — add real keys when extensions are signed.
  // "tigerpaw-official": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
};

/**
 * Compute the signing payload from a manifest object.
 * Removes the "signature" field and computes SHA-256 of the canonical JSON.
 */
function computeManifestDigest(manifest: Record<string, unknown>): Buffer {
  const cleaned = { ...manifest };
  delete cleaned.signature;
  const canonical = JSON.stringify(cleaned, Object.keys(cleaned).toSorted());
  return createHash("sha256").update(canonical, "utf8").digest();
}

export type ManifestSignature = {
  keyId: string;
  value: string; // base64-encoded Ed25519 signature
};

function parseSignature(raw: unknown): ManifestSignature | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.keyId !== "string" || typeof obj.value !== "string") {
    return undefined;
  }
  return { keyId: obj.keyId, value: obj.value };
}

/**
 * Verify the Ed25519 signature on an extension manifest.
 *
 * Returns { signed: false, verified: false } for unsigned extensions.
 * Returns { signed: true, verified: true } when signature is valid.
 * Returns { signed: true, verified: false, error: ... } on failure.
 */
export function verifyExtensionSignature(manifest: Record<string, unknown>): SignatureVerifyResult {
  const sig = parseSignature(manifest.signature);
  if (!sig) {
    return { signed: false, verified: false };
  }

  const publicKeyPem = TRUSTED_KEYS[sig.keyId];
  if (!publicKeyPem) {
    return {
      signed: true,
      verified: false,
      keyId: sig.keyId,
      error: `unknown key ID: ${sig.keyId}`,
    };
  }

  try {
    const digest = computeManifestDigest(manifest);
    const signatureBuffer = Buffer.from(sig.value, "base64");

    const publicKey = crypto.createPublicKey(publicKeyPem);
    const isValid = crypto.verify(null, digest, publicKey, signatureBuffer);

    return {
      signed: true,
      verified: isValid,
      keyId: sig.keyId,
      error: isValid ? undefined : "signature verification failed",
    };
  } catch (err) {
    return {
      signed: true,
      verified: false,
      keyId: sig.keyId,
      error: `verification error: ${String(err)}`,
    };
  }
}

/**
 * Check if any trusted keys are registered.
 */
export function hasTrustedKeys(): boolean {
  return Object.keys(TRUSTED_KEYS).length > 0;
}

/**
 * Add a trusted public key at runtime (e.g. from config).
 */
export function addTrustedKey(keyId: string, publicKeyPem: string): void {
  TRUSTED_KEYS[keyId] = publicKeyPem;
}
