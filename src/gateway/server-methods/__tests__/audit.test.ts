/**
 * Tests for the audit gateway RPC handlers.
 *
 * Mocks the SQLite-backed DAL and the chain verifier so handlers can be
 * exercised with deterministic inputs without touching the database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// -- Mocks ------------------------------------------------------------------

const mockDalReadAuditEntries = vi.fn();
vi.mock("../../../dal/trading-audit.js", () => ({
  dalReadAuditEntries: (...args: unknown[]) => mockDalReadAuditEntries(...args),
}));

const mockVerifyAuditChain = vi.fn();
vi.mock("../../../trading/audit-log.js", () => ({
  verifyAuditChain: (...args: unknown[]) => mockVerifyAuditChain(...args),
}));

// -- Helpers ----------------------------------------------------------------

function makeOpts(method: string, params: Record<string, unknown>) {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    } as unknown as GatewayRequestHandlerOptions,
    respond,
  };
}

// Seed entries ordered oldest → newest (DAL contract). The handler reverses.
// Use explicit UTC so string comparison with "YYYY-MM-DD" filters is stable.
function seed(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    extensionId: i % 2 === 0 ? "alpaca" : "polymarket",
    action: i === 3 ? "order_denied" : "order_submitted",
    actor: "operator",
    orderSnapshot: null,
    policySnapshot: null,
    error: null,
    prevHash: i === 0 ? "0" : `hash-${i - 1}`,
    hmac: `hmac-${i}`,
  }));
}

let handlers: {
  "audit.list": (opts: GatewayRequestHandlerOptions) => Promise<void>;
  "audit.verify": (opts: GatewayRequestHandlerOptions) => Promise<void>;
};

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../audit.js");
  handlers = mod.auditHandlers as typeof handlers;
});

// -- audit.list -------------------------------------------------------------

describe("audit.list", () => {
  it("returns entries newest-first with total + defaults", async () => {
    mockDalReadAuditEntries.mockReturnValue(seed(3));
    const { opts, respond } = makeOpts("audit.list", {});
    await handlers["audit.list"](opts);

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    const entries = (payload as { entries: Array<{ timestamp: string }> }).entries;
    expect(entries).toHaveLength(3);
    expect(entries[0].timestamp > entries[1].timestamp).toBe(true);
    expect(payload).toEqual(expect.objectContaining({ total: 3, limit: 100, offset: 0 }));
  });

  it("filters by extensionId", async () => {
    mockDalReadAuditEntries.mockReturnValue(seed(4));
    const { opts, respond } = makeOpts("audit.list", { extensionId: "polymarket" });
    await handlers["audit.list"](opts);

    const [, payload] = respond.mock.calls[0];
    const entries = (payload as { entries: Array<{ extensionId: string }> }).entries;
    expect(entries.every((e) => e.extensionId === "polymarket")).toBe(true);
    expect((payload as { total: number }).total).toBe(2);
  });

  it("paginates with limit + offset", async () => {
    mockDalReadAuditEntries.mockReturnValue(seed(10));
    const { opts, respond } = makeOpts("audit.list", { limit: 3, offset: 2 });
    await handlers["audit.list"](opts);

    const [, payload] = respond.mock.calls[0];
    const entries = (payload as { entries: Array<unknown> }).entries;
    expect(entries).toHaveLength(3);
    expect(payload).toEqual(expect.objectContaining({ total: 10, limit: 3, offset: 2 }));
  });

  it("filters by date range", async () => {
    mockDalReadAuditEntries.mockReturnValue(seed(5));
    // dateFrom = 2026-01-02, dateTo = 2026-01-03T23:59:59Z — keeps Jan 2 + Jan 3.
    const { opts, respond } = makeOpts("audit.list", {
      dateFrom: "2026-01-02",
      dateTo: "2026-01-03T23:59:59Z",
    });
    await handlers["audit.list"](opts);

    const [, payload] = respond.mock.calls[0];
    const entries = (payload as { entries: Array<{ timestamp: string }> }).entries;
    expect(entries).toHaveLength(2);
    expect(
      entries.every((e) => e.timestamp >= "2026-01-02" && e.timestamp <= "2026-01-03T23:59:59Z"),
    ).toBe(true);
  });

  it("clamps oversize limit + negative offset", async () => {
    mockDalReadAuditEntries.mockReturnValue(seed(5));
    const { opts, respond } = makeOpts("audit.list", { limit: 99999, offset: -5 });
    await handlers["audit.list"](opts);

    const [, payload] = respond.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({ limit: 1000, offset: 0 }));
  });

  it("responds with error when DAL throws", async () => {
    mockDalReadAuditEntries.mockImplementation(() => {
      throw new Error("sqlite boom");
    });
    const { opts, respond } = makeOpts("audit.list", {});
    await handlers["audit.list"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// -- audit.verify -----------------------------------------------------------

describe("audit.verify", () => {
  it("returns a clean-chain result", async () => {
    mockVerifyAuditChain.mockResolvedValue({ valid: 5 });
    const { opts, respond } = makeOpts("audit.verify", {});
    await handlers["audit.verify"](opts);

    expect(respond).toHaveBeenCalledWith(true, { valid: 5 }, undefined);
  });

  it("surfaces a broken-chain result verbatim", async () => {
    mockVerifyAuditChain.mockResolvedValue({ valid: 3, brokenAt: 3 });
    const { opts, respond } = makeOpts("audit.verify", {});
    await handlers["audit.verify"](opts);

    expect(respond).toHaveBeenCalledWith(true, { valid: 3, brokenAt: 3 }, undefined);
  });

  it("responds with error when the verifier throws", async () => {
    mockVerifyAuditChain.mockRejectedValue(new Error("i/o fail"));
    const { opts, respond } = makeOpts("audit.verify", {});
    await handlers["audit.verify"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});
