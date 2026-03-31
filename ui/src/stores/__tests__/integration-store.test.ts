import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGatewayRpc = vi.fn();
vi.mock("@/lib/gateway-rpc", () => ({
  gatewayRpc: (...args: unknown[]) => mockGatewayRpc(...args),
}));

// Import store AFTER mocks
const { useIntegrationStore } = await import("../integration-store");
const initialState = useIntegrationStore.getState();

beforeEach(() => {
  useIntegrationStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe("integration-store", () => {
  // --- Initial state ---
  describe("initial state", () => {
    it("has 7 demo providers", () => {
      expect(useIntegrationStore.getState().providers).toHaveLength(7);
    });

    it("has 3 demo connections", () => {
      expect(useIntegrationStore.getState().connections).toHaveLength(3);
    });

    it("demoMode is true", () => {
      expect(useIntegrationStore.getState().demoMode).toBe(true);
    });

    it("connectingProvider is null", () => {
      expect(useIntegrationStore.getState().connectingProvider).toBeNull();
    });
  });

  // --- setDemoMode ---
  describe("setDemoMode", () => {
    it("enable restores demo providers and connections", () => {
      useIntegrationStore.setState({ providers: [], connections: [], demoMode: false });
      useIntegrationStore.getState().setDemoMode(true);
      const s = useIntegrationStore.getState();
      expect(s.demoMode).toBe(true);
      expect(s.connections).toHaveLength(3);
    });

    it("disable clears connections", () => {
      useIntegrationStore.getState().setDemoMode(false);
      const s = useIntegrationStore.getState();
      expect(s.demoMode).toBe(false);
      expect(s.connections).toEqual([]);
    });
  });

  // --- setConnectingProvider ---
  describe("setConnectingProvider", () => {
    it("sets provider id", () => {
      useIntegrationStore.getState().setConnectingProvider("gmail");
      expect(useIntegrationStore.getState().connectingProvider).toBe("gmail");
    });

    it("clears with null", () => {
      useIntegrationStore.getState().setConnectingProvider("gmail");
      useIntegrationStore.getState().setConnectingProvider(null);
      expect(useIntegrationStore.getState().connectingProvider).toBeNull();
    });
  });

  // --- getConnectionForProvider ---
  describe("getConnectionForProvider", () => {
    it("returns connection when found", () => {
      const conn = useIntegrationStore.getState().getConnectionForProvider("gmail");
      expect(conn).toBeDefined();
      expect(conn!.providerId).toBe("gmail");
    });

    it("returns undefined when not found", () => {
      const conn = useIntegrationStore.getState().getConnectionForProvider("nonexistent");
      expect(conn).toBeUndefined();
    });
  });

  // --- fetchProviders ---
  describe("fetchProviders", () => {
    it("updates providers on success", async () => {
      const fakeProviders = [{ id: "slack", name: "Slack" }];
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { providers: fakeProviders } });
      await useIntegrationStore.getState().fetchProviders();
      expect(useIntegrationStore.getState().providers).toEqual(fakeProviders);
    });

    it("keeps existing providers on error", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("offline"));
      const before = useIntegrationStore.getState().providers;
      await useIntegrationStore.getState().fetchProviders();
      expect(useIntegrationStore.getState().providers).toEqual(before);
    });
  });

  // --- fetchConnections ---
  describe("fetchConnections", () => {
    it("sets connections and demoMode false on success", async () => {
      const fakeConns = [{ id: "c1", providerId: "gmail" }];
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { connections: fakeConns } });
      await useIntegrationStore.getState().fetchConnections();
      const s = useIntegrationStore.getState();
      expect(s.connections).toEqual(fakeConns);
      expect(s.demoMode).toBe(false);
    });

    it("keeps demo data on error", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("offline"));
      await useIntegrationStore.getState().fetchConnections();
      expect(useIntegrationStore.getState().demoMode).toBe(true);
      expect(useIntegrationStore.getState().connections).toHaveLength(3);
    });
  });

  // --- startOAuth ---
  describe("startOAuth", () => {
    it("sets connectingProvider during request", async () => {
      mockGatewayRpc.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ ok: true, payload: { authUrl: "https://auth", state: "st1" } }),
              10,
            ),
          ),
      );
      const p = useIntegrationStore.getState().startOAuth("gmail");
      expect(useIntegrationStore.getState().connectingProvider).toBe("gmail");
      await p;
    });

    it("returns authUrl and state on success", async () => {
      mockGatewayRpc.mockResolvedValue({
        ok: true,
        payload: { authUrl: "https://auth.example.com", state: "state123" },
      });
      const result = await useIntegrationStore.getState().startOAuth("gmail");
      expect(result).toEqual({ authUrl: "https://auth.example.com", state: "state123" });
    });

    it("returns null on failure", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: false, error: "bad" });
      const result = await useIntegrationStore.getState().startOAuth("gmail");
      expect(result).toBeNull();
    });

    it("clears connectingProvider after completion", async () => {
      mockGatewayRpc.mockResolvedValue({
        ok: true,
        payload: { authUrl: "https://a", state: "s" },
      });
      await useIntegrationStore.getState().startOAuth("gmail");
      expect(useIntegrationStore.getState().connectingProvider).toBeNull();
    });

    it("clears connectingProvider on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("network"));
      const result = await useIntegrationStore.getState().startOAuth("gmail");
      expect(result).toBeNull();
      expect(useIntegrationStore.getState().connectingProvider).toBeNull();
    });
  });

  // --- completeOAuth ---
  describe("completeOAuth", () => {
    it("adds connection on success", async () => {
      const newConn = { id: "c-new", providerId: "slack", category: "email", status: "connected" };
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { connection: newConn } });
      const result = await useIntegrationStore.getState().completeOAuth("st1", "code1");
      expect(result).toEqual(newConn);
      expect(
        useIntegrationStore.getState().connections.find((c) => c.id === "c-new"),
      ).toBeDefined();
    });

    it("replaces existing connection for same provider", async () => {
      const replacement = {
        id: "c-replace",
        providerId: "gmail",
        category: "email",
        status: "connected",
        label: "new@gmail.com",
      };
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { connection: replacement } });
      await useIntegrationStore.getState().completeOAuth("st1", "code1");
      const gmailConns = useIntegrationStore
        .getState()
        .connections.filter((c) => c.providerId === "gmail");
      expect(gmailConns).toHaveLength(1);
      expect(gmailConns[0].id).toBe("c-replace");
    });

    it("returns null on failure", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: false, error: "invalid code" });
      const result = await useIntegrationStore.getState().completeOAuth("st1", "bad");
      expect(result).toBeNull();
    });

    it("returns null on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("crash"));
      const result = await useIntegrationStore.getState().completeOAuth("st1", "code");
      expect(result).toBeNull();
    });
  });

  // --- disconnect ---
  describe("disconnect", () => {
    it("removes connection on success", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { removed: true } });
      const result = await useIntegrationStore.getState().disconnect("demo-gmail");
      expect(result).toBe(true);
      expect(
        useIntegrationStore.getState().connections.find((c) => c.id === "demo-gmail"),
      ).toBeUndefined();
    });

    it("returns false on failure", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: false, error: "not found" });
      const result = await useIntegrationStore.getState().disconnect("demo-gmail");
      expect(result).toBe(false);
    });

    it("returns false on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("offline"));
      const result = await useIntegrationStore.getState().disconnect("demo-gmail");
      expect(result).toBe(false);
    });
  });

  // --- testConnection ---
  describe("testConnection", () => {
    it("returns ok true when gateway reports success", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: true, payload: { ok: true } });
      const result = await useIntegrationStore.getState().testConnection("demo-gmail");
      expect(result).toEqual({ ok: true, error: undefined });
    });

    it("returns ok false with error when gateway reports failure", async () => {
      mockGatewayRpc.mockResolvedValue({ ok: false, error: "Token expired" });
      const result = await useIntegrationStore.getState().testConnection("demo-gmail");
      expect(result).toEqual({ ok: false, error: "Token expired" });
    });

    it("returns gateway unavailable on exception", async () => {
      mockGatewayRpc.mockRejectedValue(new Error("timeout"));
      const result = await useIntegrationStore.getState().testConnection("demo-gmail");
      expect(result).toEqual({ ok: false, error: "Gateway unavailable" });
    });
  });
});
