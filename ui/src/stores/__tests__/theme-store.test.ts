import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub localStorage before importing the store (it reads on module load)
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, val),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: () => null,
  length: 0,
});

// Dynamic import after stubs are in place
const { useThemeStore, THEMES } = await import("../theme-store");

const initialState = useThemeStore.getState();

describe("theme-store", () => {
  beforeEach(() => {
    storage.clear();
    useThemeStore.setState(initialState, true);
  });

  it("defaults to tiger-gold when localStorage is empty", () => {
    expect(useThemeStore.getState().theme).toBe("tiger-gold");
  });

  it("setTheme updates state and writes to localStorage", () => {
    useThemeStore.getState().setTheme("midnight-steel");
    expect(useThemeStore.getState().theme).toBe("midnight-steel");
    expect(storage.get("tigerpaw-theme")).toBe("midnight-steel");
  });

  it("THEMES contains exactly 2 entries", () => {
    const keys = Object.keys(THEMES);
    expect(keys).toHaveLength(2);
    expect(keys).toContain("tiger-gold");
    expect(keys).toContain("midnight-steel");
  });

  it("each theme has required fields", () => {
    for (const info of Object.values(THEMES)) {
      expect(info.id).toBeTruthy();
      expect(info.label).toBeTruthy();
      expect(info.bodyBg).toBeTruthy();
      expect(info.chartBg).toBeTruthy();
    }
  });
});
