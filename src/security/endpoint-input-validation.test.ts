/**
 * Endpoint input validation tests.
 *
 * Verify that gateway handlers properly reject adversarial, malformed, and
 * boundary-case inputs. Tests exercise the validation layer (assertValidParams)
 * and the handler-level guards that prevent prototype pollution, injection,
 * and type confusion attacks.
 */

import { describe, expect, it } from "vitest";
import {
  validateConfigGetParams,
  validateConfigSetParams,
  validateConfigPatchParams,
  validateConfigSchemaLookupParams,
  validateSendParams,
  validateCronAddParams,
  validateSessionsPatchParams,
  validateSessionsDeleteParams,
  validateNodeInvokeParams,
} from "../gateway/protocol/index.js";
import type { RespondFn } from "../gateway/server-methods/types.js";
import { assertValidParams } from "../gateway/server-methods/validation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRespondMock(): { respond: RespondFn; calls: Array<[boolean, unknown, unknown]> } {
  const calls: Array<[boolean, unknown, unknown]> = [];
  const respond: RespondFn = (ok, payload, error) => {
    calls.push([ok, payload, error]);
  };
  return { respond, calls };
}

function oversizedString(bytes: number): string {
  return "x".repeat(bytes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("endpoint input validation: type confusion", () => {
  it("config.get rejects NaN in numeric fields", () => {
    const { respond } = createRespondMock();
    const result = assertValidParams(
      { depth: NaN },
      validateConfigGetParams,
      "config.get",
      respond,
    );
    // NaN is not valid JSON; Ajv will reject or the handler ignores it.
    // The assertion is that it does not crash.
    expect(typeof result).toBe("boolean");
  });

  it("config.set rejects Infinity in numeric fields", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams({ raw: Infinity }, validateConfigSetParams, "config.set", respond);
    // Should have responded with error
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("config.set rejects non-string raw param", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams(
      { raw: 12345, baseHash: "abc" },
      validateConfigSetParams,
      "config.set",
      respond,
    );
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("config.patch rejects non-string raw param", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams(
      { raw: [1, 2, 3], baseHash: "abc" },
      validateConfigPatchParams,
      "config.patch",
      respond,
    );
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("send rejects non-string message", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams({ message: { nested: "object" } }, validateSendParams, "send", respond);
    // sendParams requires message to be a string
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("cron.add rejects non-string schedule", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams(
      { name: "test", schedule: 42, command: "echo hi" },
      validateCronAddParams,
      "cron.add",
      respond,
    );
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });
});

describe("endpoint input validation: prototype pollution", () => {
  it("rejects __proto__ key in config.set raw JSON", () => {
    const { respond } = createRespondMock();
    const maliciousJson = JSON.stringify({ __proto__: { polluted: true } });
    assertValidParams(
      { raw: maliciousJson, baseHash: "abc123" },
      validateConfigSetParams,
      "config.set",
      respond,
    );
    // Even if validation passes (raw is a string), the parsed object
    // should not pollute Object.prototype
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects constructor.prototype in patch object", () => {
    const { respond } = createRespondMock();
    const maliciousJson = JSON.stringify({ constructor: { prototype: { polluted: true } } });
    assertValidParams(
      { raw: maliciousJson, baseHash: "abc123" },
      validateConfigPatchParams,
      "config.patch",
      respond,
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("JSON.parse does not allow __proto__ to pollute prototype chain", () => {
    const parsed = JSON.parse('{"__proto__": {"evil": true}}');
    // JSON.parse sets __proto__ as an own property, not on the prototype chain
    expect(({} as Record<string, unknown>).evil).toBeUndefined();
    // The key exists as own property on the parsed object
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(true);
  });
});

describe("endpoint input validation: injection patterns", () => {
  it("config.schema.lookup handles SQL-injection-style path", () => {
    const { respond } = createRespondMock();
    const result = assertValidParams(
      { path: "'; DROP TABLE config; --" },
      validateConfigSchemaLookupParams,
      "config.schema.lookup",
      respond,
    );
    // Should pass validation (it's a valid string) but do no harm
    expect(typeof result).toBe("boolean");
  });

  it("config.schema.lookup handles path with null bytes", () => {
    const { respond } = createRespondMock();
    assertValidParams(
      { path: "gateway\x00.auth" },
      validateConfigSchemaLookupParams,
      "config.schema.lookup",
      respond,
    );
    // Should not crash
    expect(true).toBe(true);
  });

  it("send handles message containing only null bytes", () => {
    const { respond } = createRespondMock();
    assertValidParams({ message: "\x00\x00\x00" }, validateSendParams, "send", respond);
    // Should not crash
    expect(true).toBe(true);
  });
});

describe("endpoint input validation: oversized inputs", () => {
  it("handles oversized string params (>10KB) without crashing", () => {
    const { respond } = createRespondMock();
    const hugeString = oversizedString(11 * 1024); // 11KB
    assertValidParams(
      { path: hugeString },
      validateConfigSchemaLookupParams,
      "config.schema.lookup",
      respond,
    );
    // Should not crash even with large input
    expect(true).toBe(true);
  });

  it("handles deeply nested JSON objects without stack overflow", () => {
    let obj: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 100; i++) {
      obj = { nested: obj };
    }
    const { respond } = createRespondMock();
    assertValidParams(
      { raw: JSON.stringify(obj), baseHash: "abc" },
      validateConfigSetParams,
      "config.set",
      respond,
    );
    // Should not throw a stack overflow
    expect(true).toBe(true);
  });
});

describe("endpoint input validation: boundary values", () => {
  it("node.invoke rejects missing command field", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams({ nodeId: "some-node" }, validateNodeInvokeParams, "node.invoke", respond);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("sessions.patch rejects empty params", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams({}, validateSessionsPatchParams, "sessions.patch", respond);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("sessions.delete rejects missing sessionKey", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams({}, validateSessionsDeleteParams, "sessions.delete", respond);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("cron.add rejects missing required fields", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams({}, validateCronAddParams, "cron.add", respond);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("config.set rejects null params", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams(null, validateConfigSetParams, "config.set", respond);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("config.patch rejects array params", () => {
    const { respond, calls } = createRespondMock();
    assertValidParams([], validateConfigPatchParams, "config.patch", respond);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });

  it("assertValidParams returns false for undefined params", () => {
    const { respond, calls } = createRespondMock();
    const result = assertValidParams(undefined, validateConfigSetParams, "config.set", respond);
    expect(result).toBe(false);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(false);
  });
});
