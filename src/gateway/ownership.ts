/**
 * Ownership identity resolution for multi-device access control.
 *
 * Strategies and workflows can be stamped with an owner on creation;
 * subsequent mutations check ownership so users cannot accidentally
 * overwrite each other's resources.  Unowned (legacy) resources remain
 * editable by anyone.
 */

import type { GatewayClient } from "./server-methods/types.js";

export type OwnerIdentity = {
  ownerId: string;
  ownerLabel: string;
  source: "device" | "tailscale" | "trusted-proxy" | "shared-auth";
};

export type OwnershipResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Derive a deterministic owner identity from a connected client.
 *
 * Priority:
 *  1. `client.connect.device?.id` -- device-auth (most specific)
 *  2. `client.connect.client.id`  -- shared-auth fallback
 */
export function resolveOwnerIdentity(
  client: GatewayClient | null | undefined,
): OwnerIdentity | undefined {
  if (!client?.connect) {
    return undefined;
  }

  const displayName = client.connect.client?.displayName;

  const deviceId = client.connect.device?.id;
  if (deviceId) {
    return {
      ownerId: deviceId,
      ownerLabel: displayName ?? deviceId,
      source: "device",
    };
  }

  const clientId = client.connect.client?.id;
  if (clientId) {
    return {
      ownerId: clientId,
      ownerLabel: displayName ?? clientId,
      source: "shared-auth",
    };
  }

  return undefined;
}

/**
 * Check whether a caller is allowed to mutate a resource.
 *
 * Unowned resources (no `resourceOwnerId`) are open to everyone.
 * Anonymous callers can only touch unowned resources.
 */
export function checkOwnership(
  resourceOwnerId: string | undefined,
  callerId: string | undefined,
): OwnershipResult {
  if (!resourceOwnerId) {
    return { allowed: true };
  }

  if (!callerId) {
    return { allowed: false, reason: "authentication required to modify an owned resource" };
  }

  if (callerId !== resourceOwnerId) {
    return { allowed: false, reason: "you do not own this resource" };
  }

  return { allowed: true };
}

/** Throw if the ownership check fails. */
export function assertOwnership(
  resourceOwnerId: string | undefined,
  callerId: string | undefined,
): void {
  const result = checkOwnership(resourceOwnerId, callerId);
  if (!result.allowed) {
    throw new OwnershipError(result.reason);
  }
}

/** Sentinel error thrown by assertOwnership so handlers can distinguish ownership failures. */
export class OwnershipError extends Error {
  override readonly name = "OwnershipError";
}
