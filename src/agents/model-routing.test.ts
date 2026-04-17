import { describe, expect, it, vi } from "vitest";
import type { IntentCategory } from "./intent-classifier.js";
import { resolveIntentRoute, type RoutingConfig } from "./model-routing.js";

// Suppress subsystem logger output during tests.
// vi.hoisted runs before vi.mock hoisting, so the reference is available.
const mockLogger = vi.hoisted(() => {
  const logger: Record<string, unknown> = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  logger.child = () => logger;
  return logger;
});
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => mockLogger,
}));

function makeCfg(providers: Record<string, unknown> = {}) {
  return {
    models: { providers },
  } as never;
}

const PERPLEXITY_CFG = makeCfg({
  perplexity: { baseUrl: "https://api.perplexity.ai", models: [{ id: "sonar-pro" }] },
  anthropic: { baseUrl: "https://api.anthropic.com", models: [{ id: "claude-opus-4-6" }] },
  ollama: { baseUrl: "http://localhost:11434", models: [{ id: "gemma3:26b" }] },
});

const ROUTING_ENABLED: RoutingConfig = {
  enabled: true,
  rules: [
    { intent: "search", provider: "perplexity", model: "sonar-pro" },
    { intent: "reasoning", provider: "anthropic", model: "claude-opus-4-6" },
    { intent: "code", provider: "anthropic", model: "claude-opus-4-6" },
  ],
};

describe("resolveIntentRoute", () => {
  describe("disabled routing", () => {
    it("returns disabled when enabled is false", () => {
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: { enabled: false, rules: ROUTING_ENABLED.rules },
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("disabled");
      }
    });

    it("returns disabled when routingConfig is undefined", () => {
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: undefined,
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("disabled");
      }
    });

    it("returns disabled when enabled is not set", () => {
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: { rules: ROUTING_ENABLED.rules },
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("disabled");
      }
    });
  });

  describe("general intent", () => {
    it("always returns general-intent for general", () => {
      const result = resolveIntentRoute({
        intent: "general",
        cfg: PERPLEXITY_CFG,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("general-intent");
        expect(result.intent).toBe("general");
      }
    });
  });

  describe("matching rules", () => {
    it("routes search to perplexity", () => {
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(true);
      if (result.routed) {
        expect(result.ref.provider).toBe("perplexity");
        expect(result.ref.model).toBe("sonar-pro");
        expect(result.intent).toBe("search");
      }
    });

    it("routes reasoning to anthropic", () => {
      const result = resolveIntentRoute({
        intent: "reasoning",
        cfg: PERPLEXITY_CFG,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(true);
      if (result.routed) {
        expect(result.ref.provider).toBe("anthropic");
        expect(result.ref.model).toBe("claude-opus-4-6");
      }
    });

    it("routes code to anthropic", () => {
      const result = resolveIntentRoute({
        intent: "code",
        cfg: PERPLEXITY_CFG,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(true);
      if (result.routed) {
        expect(result.ref.provider).toBe("anthropic");
        expect(result.ref.model).toBe("claude-opus-4-6");
      }
    });
  });

  describe("no matching rule", () => {
    it("returns no-rule when intent has no rule", () => {
      const result = resolveIntentRoute({
        intent: "creative",
        cfg: PERPLEXITY_CFG,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("no-rule");
        expect(result.intent).toBe("creative");
      }
    });

    it("returns no-rule when rules array is empty", () => {
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: { enabled: true, rules: [] },
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("no-rule");
      }
    });

    it("returns no-rule when rules is undefined", () => {
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: { enabled: true },
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("no-rule");
      }
    });
  });

  describe("provider not configured", () => {
    it("returns provider-unavailable when provider not in config", () => {
      const cfg = makeCfg({
        ollama: { baseUrl: "http://localhost:11434", models: [] },
      });
      const result = resolveIntentRoute({
        intent: "search",
        cfg,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("provider-unavailable");
      }
    });

    it("returns provider-unavailable when no providers configured", () => {
      const cfg = makeCfg({});
      const result = resolveIntentRoute({
        intent: "search",
        cfg,
        routingConfig: ROUTING_ENABLED,
      });
      expect(result.routed).toBe(false);
      if (!result.routed) {
        expect(result.reason).toBe("provider-unavailable");
      }
    });
  });

  describe("provider normalization", () => {
    it("matches provider case-insensitively", () => {
      const config: RoutingConfig = {
        enabled: true,
        rules: [{ intent: "search", provider: "Perplexity", model: "sonar-pro" }],
      };
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: config,
      });
      expect(result.routed).toBe(true);
      if (result.routed) {
        expect(result.ref.provider).toBe("perplexity");
      }
    });
  });

  describe("multiple rules for same intent", () => {
    it("uses the first matching rule", () => {
      const config: RoutingConfig = {
        enabled: true,
        rules: [
          { intent: "search", provider: "perplexity", model: "sonar-pro" },
          { intent: "search", provider: "anthropic", model: "claude-opus-4-6" },
        ],
      };
      const result = resolveIntentRoute({
        intent: "search",
        cfg: PERPLEXITY_CFG,
        routingConfig: config,
      });
      expect(result.routed).toBe(true);
      if (result.routed) {
        expect(result.ref.provider).toBe("perplexity");
        expect(result.ref.model).toBe("sonar-pro");
      }
    });
  });

  describe("intent type safety", () => {
    it("handles all intent types", () => {
      const intents: IntentCategory[] = ["search", "reasoning", "code", "creative", "general"];
      for (const intent of intents) {
        const result = resolveIntentRoute({
          intent,
          cfg: PERPLEXITY_CFG,
          routingConfig: ROUTING_ENABLED,
        });
        expect(result.intent).toBe(intent);
      }
    });
  });
});
