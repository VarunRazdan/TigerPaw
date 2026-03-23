import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFile, mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: { readFile: mockReadFile, writeFile: mockWriteFile, mkdir: mockMkdir },
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { checkCredentialAge, recordCredentialStore } from "./credential-rotation.js";

describe("recordCredentialStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
  });

  it("creates new metadata entry with current timestamp", async () => {
    await recordCredentialStore("alpaca", "apiKey");
    const writeCall = mockWriteFile.mock.calls[0];
    const written = JSON.parse(writeCall[1] as string);
    expect(written.credentials["alpaca:apiKey"].storedAt).toBe("2026-01-15T12:00:00.000Z");
    expect(written.credentials["alpaca:apiKey"].extensionId).toBe("alpaca");
    expect(written.credentials["alpaca:apiKey"].secretId).toBe("apiKey");
  });

  it("overwrites timestamp on re-store", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "alpaca:apiKey": {
            storedAt: "2025-01-01T00:00:00.000Z",
            extensionId: "alpaca",
            secretId: "apiKey",
          },
        },
      }),
    );
    await recordCredentialStore("alpaca", "apiKey");
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.credentials["alpaca:apiKey"].storedAt).toBe("2026-01-15T12:00:00.000Z");
  });

  it("preserves other entries", async () => {
    mockReadFile.mockReset();
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "binance:apiKey": {
            storedAt: "2026-01-01T00:00:00.000Z",
            extensionId: "binance",
            secretId: "apiKey",
          },
        },
      }),
    );
    await recordCredentialStore("alpaca", "apiKey");
    const writeCall = mockWriteFile.mock.calls[0];
    const written = JSON.parse(writeCall[1] as string);
    expect(written.credentials["binance:apiKey"]).toBeDefined();
    expect(written.credentials["alpaca:apiKey"]).toBeDefined();
  });

  it("silently handles write failure", async () => {
    mockWriteFile.mockRejectedValue(new Error("EACCES"));
    // Should not throw
    await recordCredentialStore("alpaca", "apiKey");
  });
});

describe("checkCredentialAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns empty array when no credentials tracked", async () => {
    const results = await checkCredentialAge();
    expect(results).toEqual([]);
  });

  it("reports credentials not expired within threshold", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "alpaca:apiKey": {
            storedAt: "2026-05-01T12:00:00.000Z",
            extensionId: "alpaca",
            secretId: "apiKey",
          },
        },
      }),
    );
    const results = await checkCredentialAge();
    expect(results).toHaveLength(1);
    expect(results[0].isExpired).toBe(false);
    expect(results[0].ageDays).toBe(31);
  });

  it("reports credentials expired when age >= threshold", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "alpaca:apiKey": {
            storedAt: "2026-01-01T12:00:00.000Z",
            extensionId: "alpaca",
            secretId: "apiKey",
          },
        },
      }),
    );
    const results = await checkCredentialAge();
    expect(results).toHaveLength(1);
    expect(results[0].isExpired).toBe(true);
    expect(results[0].ageDays).toBeGreaterThanOrEqual(90);
  });

  it("uses default 90-day threshold", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "x:key": {
            storedAt: "2026-03-05T12:00:00.000Z", // 88 days ago
            extensionId: "x",
            secretId: "key",
          },
        },
      }),
    );
    const results = await checkCredentialAge();
    expect(results[0].isExpired).toBe(false);
  });

  it("uses custom threshold when provided", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "x:key": {
            storedAt: "2026-05-25T12:00:00.000Z", // 7 days ago
            extensionId: "x",
            secretId: "key",
          },
        },
      }),
    );
    const results = await checkCredentialAge(5);
    expect(results[0].isExpired).toBe(true);
  });

  it("handles corrupt storedAt dates", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        credentials: {
          "x:key": {
            storedAt: "not-a-date",
            extensionId: "x",
            secretId: "key",
          },
        },
      }),
    );
    const results = await checkCredentialAge();
    expect(results[0].isExpired).toBe(true);
    expect(results[0].ageDays).toBe(Number.POSITIVE_INFINITY);
  });

  it("silently handles read failure", async () => {
    mockReadFile.mockRejectedValue(new Error("EACCES"));
    const results = await checkCredentialAge();
    expect(results).toEqual([]);
  });
});
