import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInfo = vi.fn();

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: mockInfo,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

const { logSecretAccess } = await import("./access-log.js");
type SecretAccessEntry = import("./access-log.js").SecretAccessEntry;

describe("secrets/access-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits log with correct fields", () => {
    logSecretAccess({ secretId: "my-key", accessor: "keychain", operation: "read" });

    expect(mockInfo).toHaveBeenCalledOnce();
    const [message, meta] = mockInfo.mock.calls[0] as [string, SecretAccessEntry];
    expect(message).toBe("secret read: my-key by keychain");
    expect(meta).toMatchObject({
      secretId: "my-key",
      accessor: "keychain",
      operation: "read",
    });
    expect(meta.timestamp).toBeDefined();
  });

  it("timestamp is ISO-8601 format", () => {
    logSecretAccess({ secretId: "key-1", accessor: "test", operation: "write" });

    const [, meta] = mockInfo.mock.calls[0] as [string, SecretAccessEntry];
    expect(() => new Date(meta.timestamp)).not.toThrow();
    expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it("read operation logged correctly", () => {
    logSecretAccess({ secretId: "s1", accessor: "a", operation: "read" });
    const [msg] = mockInfo.mock.calls[0] as [string];
    expect(msg).toContain("read");
  });

  it("write operation logged correctly", () => {
    logSecretAccess({ secretId: "s2", accessor: "a", operation: "write" });
    const [msg] = mockInfo.mock.calls[0] as [string];
    expect(msg).toContain("write");
  });

  it("delete operation logged correctly", () => {
    logSecretAccess({ secretId: "s3", accessor: "a", operation: "delete" });
    const [msg] = mockInfo.mock.calls[0] as [string];
    expect(msg).toContain("delete");
  });

  it("accessor field propagated", () => {
    logSecretAccess({ secretId: "s4", accessor: "workflow", operation: "read" });

    const [, meta] = mockInfo.mock.calls[0] as [string, SecretAccessEntry];
    expect(meta.accessor).toBe("workflow");
  });

  it("context field is optional", () => {
    logSecretAccess({ secretId: "s5", accessor: "a", operation: "read" });
    const [, metaWithout] = mockInfo.mock.calls[0] as [string, SecretAccessEntry];
    expect(metaWithout.context).toBeUndefined();

    logSecretAccess({ secretId: "s6", accessor: "a", operation: "read", context: "test-ctx" });
    const [, metaWith] = mockInfo.mock.calls[1] as [string, SecretAccessEntry];
    expect(metaWith.context).toBe("test-ctx");
  });

  it("error in logging does not crash the operation", () => {
    mockInfo.mockImplementationOnce(() => {
      throw new Error("logging broke");
    });

    expect(() => {
      logSecretAccess({ secretId: "s7", accessor: "a", operation: "read" });
    }).not.toThrow();
  });
});
