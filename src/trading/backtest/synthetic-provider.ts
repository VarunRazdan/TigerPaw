// Stub for tests — real implementation lives in main branch
export class SyntheticDataProvider {
  async fetchBars() {
    return { bars: [], source: "synthetic" as const, cached: false };
  }
}
