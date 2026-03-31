import { describe, expect, it } from "vitest";
import {
  assertOwnership,
  checkOwnership,
  OwnershipError,
  resolveOwnerIdentity,
  type OwnerIdentity,
} from "../gateway/ownership.js";

describe("resolveOwnerIdentity", () => {
  it("returns device identity when device auth is present", () => {
    const client = {
      connect: {
        minProtocol: 1,
        maxProtocol: 1,
        client: { id: "cli-1", version: "1.0", platform: "macos", mode: "full" },
        device: {
          id: "dev-abc",
          publicKey: "pk",
          signature: "sig",
          signedAt: 1,
          nonce: "n",
        },
      },
    } as unknown;

    const result = resolveOwnerIdentity(client);
    expect(result).toEqual<OwnerIdentity>({
      ownerId: "dev-abc",
      ownerLabel: "dev-abc",
      source: "device",
    });
  });

  it("uses displayName for ownerLabel when available", () => {
    const client = {
      connect: {
        minProtocol: 1,
        maxProtocol: 1,
        client: {
          id: "cli-1",
          displayName: "Alice's MacBook",
          version: "1.0",
          platform: "macos",
          mode: "full",
        },
        device: {
          id: "dev-abc",
          publicKey: "pk",
          signature: "sig",
          signedAt: 1,
          nonce: "n",
        },
      },
    } as unknown;

    const result = resolveOwnerIdentity(client);
    expect(result?.ownerLabel).toBe("Alice's MacBook");
  });

  it("falls back to shared-auth when no device auth", () => {
    const client = {
      connect: {
        minProtocol: 1,
        maxProtocol: 1,
        client: { id: "web-ui-99", version: "1.0", platform: "web", mode: "full" },
      },
    } as unknown;

    const result = resolveOwnerIdentity(client);
    expect(result).toEqual<OwnerIdentity>({
      ownerId: "web-ui-99",
      ownerLabel: "web-ui-99",
      source: "shared-auth",
    });
  });

  it("returns undefined for null client", () => {
    expect(resolveOwnerIdentity(null)).toBeUndefined();
    expect(resolveOwnerIdentity(undefined)).toBeUndefined();
  });
});

describe("checkOwnership", () => {
  it("allows anyone to modify unowned resources", () => {
    expect(checkOwnership(undefined, "user-1")).toEqual({ allowed: true });
    expect(checkOwnership(undefined, undefined)).toEqual({ allowed: true });
  });

  it("allows the owner to modify their resource", () => {
    expect(checkOwnership("user-1", "user-1")).toEqual({ allowed: true });
  });

  it("blocks a different user from modifying an owned resource", () => {
    const result = checkOwnership("user-1", "user-2");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/do not own/);
  });

  it("blocks anonymous callers from modifying an owned resource", () => {
    const result = checkOwnership("user-1", undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/authentication required/);
  });
});

describe("strategy registry ownership", () => {
  it("save stamps owner on create (contract)", () => {
    const strategy = {
      id: "s1",
      name: "Test",
      description: "",
      enabled: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: "dev-abc",
      ownerLabel: "Alice",
      symbols: ["BTC"],
      extensionId: "ext-1",
      signals: [],
      entryRule: { minSignalStrength: 0.5, orderType: "market" as const },
      exitRule: {},
      positionSizing: { method: "fixed_usd" as const, maxPositionPercent: 10 },
      schedule: "continuous" as const,
      totalTrades: 0,
      winRate: 0,
      totalPnlUsd: 0,
    };
    expect(strategy.ownerId).toBe("dev-abc");
    expect(strategy.ownerLabel).toBe("Alice");
  });

  it("update checks owner", () => {
    const result = checkOwnership("user-1", "user-2");
    expect(result.allowed).toBe(false);
  });

  it("update unowned strategy succeeds", () => {
    const result = checkOwnership(undefined, "user-2");
    expect(result.allowed).toBe(true);
  });

  it("delete checks owner", () => {
    const result = checkOwnership("owner-a", "owner-a");
    expect(result.allowed).toBe(true);
  });

  it("delete by wrong owner fails", () => {
    const result = checkOwnership("owner-a", "owner-b");
    expect(result.allowed).toBe(false);
  });
});

describe("workflow ownership", () => {
  it("workflow save stamps owner on create (type contract)", () => {
    const workflow = {
      id: "wf-1",
      name: "Test Workflow",
      description: "",
      enabled: true,
      nodes: [],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
      ownerId: "dev-xyz",
      ownerLabel: "Bob",
    };
    expect(workflow.ownerId).toBe("dev-xyz");
    expect(workflow.ownerLabel).toBe("Bob");
  });

  it("workflow update checks owner", () => {
    const result = checkOwnership("user-1", "user-2");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/do not own/);
  });
});

describe("handler resolves owner from client", () => {
  it("resolves device owner from a full client object", () => {
    const client = {
      connect: {
        minProtocol: 1,
        maxProtocol: 1,
        client: { id: "cli-1", version: "1.0", platform: "linux", mode: "full" },
        device: {
          id: "device-42",
          publicKey: "pk",
          signature: "sig",
          signedAt: Date.now(),
          nonce: "n",
        },
      },
    } as unknown;

    const owner = resolveOwnerIdentity(client);
    expect(owner?.ownerId).toBe("device-42");
    expect(owner?.source).toBe("device");
  });
});

describe("assertOwnership", () => {
  it("throws OwnershipError when ownership check fails", () => {
    expect(() => assertOwnership("user-1", "user-2")).toThrow(OwnershipError);
  });

  it("does not throw for matching owners", () => {
    expect(() => assertOwnership("user-1", "user-1")).not.toThrow();
  });

  it("does not throw for unowned resources", () => {
    expect(() => assertOwnership(undefined, "user-1")).not.toThrow();
  });
});

describe("backward compatibility", () => {
  it("existing data without ownerId loads fine", () => {
    const legacyStrategy = {
      id: "s-legacy",
      name: "Old Strategy",
      description: "",
      enabled: true,
      version: 3,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      symbols: ["ETH"],
      extensionId: "ext-1",
      signals: [],
      entryRule: { minSignalStrength: 0.5, orderType: "market" as const },
      exitRule: {},
      positionSizing: { method: "fixed_usd" as const, maxPositionPercent: 10 },
      schedule: "continuous" as const,
      totalTrades: 42,
      winRate: 0.65,
      totalPnlUsd: 1200,
    };

    expect(checkOwnership(legacyStrategy.ownerId, "any-user")).toEqual({
      allowed: true,
    });
    expect(legacyStrategy.ownerId).toBeUndefined();
  });
});
