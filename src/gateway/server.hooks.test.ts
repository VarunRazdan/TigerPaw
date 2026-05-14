import { describe, expect, test } from "vitest";
import { resolveMainSessionKeyFromConfig } from "../config/sessions.js";
import { drainSystemEvents, peekSystemEvents } from "../infra/system-events.js";
import {
  cronIsolatedRun,
  installGatewayTestHooks,
  testState,
  withGatewayServer,
  waitForSystemEvent,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

const resolveMainKey = () => resolveMainSessionKeyFromConfig();
const HOOK_TOKEN = "hook-secret";

function buildHookJsonHeaders(options?: {
  token?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  const token = options?.token === undefined ? HOOK_TOKEN : options.token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options?.headers,
  };
}

async function postHook(
  port: number,
  path: string,
  body: Record<string, unknown> | string,
  options?: {
    token?: string | null;
    headers?: Record<string, string>;
  },
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: buildHookJsonHeaders(options),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function setMainAndHooksAgents(): void {
  testState.agentsConfig = {
    list: [{ id: "main", default: true }, { id: "hooks" }],
  };
}

function mockIsolatedRunOkOnce(): void {
  cronIsolatedRun.mockClear();
  cronIsolatedRun.mockResolvedValueOnce({
    status: "ok",
    summary: "done",
  });
}

describe("gateway server hooks", () => {
  test("handles auth, wake, and agent flows", async () => {
    testState.hooksConfig = { enabled: true, token: HOOK_TOKEN };
    setMainAndHooksAgents();
    await withGatewayServer(async ({ port }) => {
      const resNoAuth = await postHook(port, "/hooks/wake", { text: "Ping" }, { token: null });
      expect(resNoAuth.status).toBe(401);

      const resWake = await postHook(port, "/hooks/wake", { text: "Ping", mode: "next-heartbeat" });
      expect(resWake.status).toBe(200);
      const wakeEvents = await waitForSystemEvent();
      expect(wakeEvents.some((e) => e.includes("Ping"))).toBe(true);
      drainSystemEvents(resolveMainKey());

      mockIsolatedRunOkOnce();
      const resAgent = await postHook(port, "/hooks/agent", { message: "Do it", name: "Email" });
      expect(resAgent.status).toBe(200);
      const agentEvents = await waitForSystemEvent();
      expect(agentEvents.some((e) => e.includes("Hook Email: done"))).toBe(true);
      const firstCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as {
        deliveryContract?: string;
      };
      expect(firstCall?.deliveryContract).toBe("shared");
      drainSystemEvents(resolveMainKey());

      mockIsolatedRunOkOnce();
      const resAgentModel = await postHook(port, "/hooks/agent", {
        message: "Do it",
        name: "Email",
        model: "openai/gpt-4.1-mini",
      });
      expect(resAgentModel.status).toBe(200);
      await waitForSystemEvent();
      const call = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as {
        job?: { payload?: { model?: string } };
      };
      expect(call?.job?.payload?.model).toBe("openai/gpt-4.1-mini");
      drainSystemEvents(resolveMainKey());

      mockIsolatedRunOkOnce();
      const resAgentWithId = await postHook(port, "/hooks/agent", {
        message: "Do it",
        name: "Email",
        agentId: "hooks",
      });
      expect(resAgentWithId.status).toBe(200);
      await waitForSystemEvent();
      const routedCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as {
        job?: { agentId?: string };
      };
      expect(routedCall?.job?.agentId).toBe("hooks");
      drainSystemEvents(resolveMainKey());

      mockIsolatedRunOkOnce();
      const resAgentUnknown = await postHook(port, "/hooks/agent", {
        message: "Do it",
        name: "Email",
        agentId: "missing-agent",
      });
      expect(resAgentUnknown.status).toBe(200);
      await waitForSystemEvent();
      const fallbackCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as {
        job?: { agentId?: string };
      };
      expect(fallbackCall?.job?.agentId).toBe("main");
      drainSystemEvents(resolveMainKey());

      const resQuery = await postHook(
        port,
        "/hooks/wake?token=hook-secret",
        { text: "Query auth" },
        { token: null },
      );
      expect(resQuery.status).toBe(400);

      const resBadChannel = await postHook(port, "/hooks/agent", {
        message: "Nope",
        channel: "sms",
      });
      expect(resBadChannel.status).toBe(400);
      expect(peekSystemEvents(resolveMainKey()).length).toBe(0);

      const resHeader = await postHook(
        port,
        "/hooks/wake",
        { text: "Header auth" },
        { token: null, headers: { "x-openclaw-token": HOOK_TOKEN } },
      );
      expect(resHeader.status).toBe(200);
      const headerEvents = await waitForSystemEvent();
      expect(headerEvents.some((e) => e.includes("Header auth"))).toBe(true);
      drainSystemEvents(resolveMainKey());

      const resGet = await fetch(`http://127.0.0.1:${port}/hooks/wake`, {
        method: "GET",
        headers: { Authorization: "Bearer hook-secret" },
      });
      expect(resGet.status).toBe(405);

      const resBlankText = await postHook(port, "/hooks/wake", { text: " " });
      expect(resBlankText.status).toBe(400);

      const resBlankMessage = await postHook(port, "/hooks/agent", { message: " " });
      expect(resBlankMessage.status).toBe(400);

      const resBadJson = await postHook(port, "/hooks/wake", "{");
      expect(resBadJson.status).toBe(400);
    });
  });

  test("rejects request sessionKey unless hooks.allowRequestSessionKey is enabled", async () => {
    testState.hooksConfig = { enabled: true, token: HOOK_TOKEN };
    await withGatewayServer(async ({ port }) => {
      const denied = await postHook(port, "/hooks/agent", {
        message: "Do it",
        sessionKey: "agent:main:dm:u99999",
      });
      expect(denied.status).toBe(400);
      const deniedBody = (await denied.json()) as { error?: string };
      expect(deniedBody.error).toContain("hooks.allowRequestSessionKey");
    });
  });

  test("respects hooks session policy for request + mapping session keys", async () => {
    testState.hooksConfig = {
      enabled: true,
      token: HOOK_TOKEN,
      allowRequestSessionKey: true,
      allowedSessionKeyPrefixes: ["hook:"],
      defaultSessionKey: "hook:ingress",
      mappings: [
        {
          match: { path: "mapped-ok" },
          action: "agent",
          messageTemplate: "Mapped: {{payload.subject}}",
          sessionKey: "hook:mapped:{{payload.id}}",
        },
        {
          match: { path: "mapped-bad" },
          action: "agent",
          messageTemplate: "Mapped: {{payload.subject}}",
          sessionKey: "agent:main:main",
        },
      ],
    };
    await withGatewayServer(async ({ port }) => {
      cronIsolatedRun.mockClear();
      cronIsolatedRun.mockResolvedValue({ status: "ok", summary: "done" });

      const defaultRoute = await fetch(`http://127.0.0.1:${port}/hooks/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer hook-secret",
        },
        body: JSON.stringify({ message: "No key" }),
      });
      expect(defaultRoute.status).toBe(200);
      await waitForSystemEvent();
      const defaultCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as
        | { sessionKey?: string }
        | undefined;
      expect(defaultCall?.sessionKey).toBe("hook:ingress");
      drainSystemEvents(resolveMainKey());

      cronIsolatedRun.mockClear();
      cronIsolatedRun.mockResolvedValue({ status: "ok", summary: "done" });
      const mappedOk = await fetch(`http://127.0.0.1:${port}/hooks/mapped-ok`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer hook-secret",
        },
        body: JSON.stringify({ subject: "hello", id: "42" }),
      });
      expect(mappedOk.status).toBe(200);
      await waitForSystemEvent();
      const mappedCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as
        | { sessionKey?: string }
        | undefined;
      expect(mappedCall?.sessionKey).toBe("hook:mapped:42");
      drainSystemEvents(resolveMainKey());

      const requestBadPrefix = await postHook(port, "/hooks/agent", {
        message: "Bad key",
        sessionKey: "agent:main:main",
      });
      expect(requestBadPrefix.status).toBe(400);

      const mappedBadPrefix = await postHook(port, "/hooks/mapped-bad", { subject: "hello" });
      expect(mappedBadPrefix.status).toBe(400);
    });
  });

  test("normalizes duplicate target-agent prefixes before isolated dispatch", async () => {
    testState.hooksConfig = {
      enabled: true,
      token: HOOK_TOKEN,
      allowRequestSessionKey: true,
      allowedSessionKeyPrefixes: ["hook:", "agent:"],
    };
    setMainAndHooksAgents();
    await withGatewayServer(async ({ port }) => {
      mockIsolatedRunOkOnce();

      const resAgent = await postHook(port, "/hooks/agent", {
        message: "Do it",
        name: "Email",
        agentId: "hooks",
        sessionKey: "agent:hooks:slack:channel:c123",
      });
      expect(resAgent.status).toBe(200);
      await waitForSystemEvent();

      const routedCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as
        | { sessionKey?: string; job?: { agentId?: string } }
        | undefined;
      expect(routedCall?.job?.agentId).toBe("hooks");
      expect(routedCall?.sessionKey).toBe("slack:channel:c123");
      drainSystemEvents(resolveMainKey());
    });
  });

  test("enforces hooks.allowedAgentIds for explicit agent routing", async () => {
    testState.hooksConfig = {
      enabled: true,
      token: HOOK_TOKEN,
      allowedAgentIds: ["hooks"],
      mappings: [
        {
          match: { path: "mapped" },
          action: "agent",
          agentId: "main",
          messageTemplate: "Mapped: {{payload.subject}}",
        },
      ],
    };
    setMainAndHooksAgents();
    await withGatewayServer(async ({ port }) => {
      mockIsolatedRunOkOnce();
      const resNoAgent = await postHook(port, "/hooks/agent", { message: "No explicit agent" });
      expect(resNoAgent.status).toBe(200);
      await waitForSystemEvent();
      const noAgentCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as {
        job?: { agentId?: string };
      };
      expect(noAgentCall?.job?.agentId).toBeUndefined();
      drainSystemEvents(resolveMainKey());

      mockIsolatedRunOkOnce();
      const resAllowed = await postHook(port, "/hooks/agent", {
        message: "Allowed",
        agentId: "hooks",
      });
      expect(resAllowed.status).toBe(200);
      await waitForSystemEvent();
      const allowedCall = (cronIsolatedRun.mock.calls[0] as unknown[] | undefined)?.[0] as {
        job?: { agentId?: string };
      };
      expect(allowedCall?.job?.agentId).toBe("hooks");
      drainSystemEvents(resolveMainKey());

      const resDenied = await postHook(port, "/hooks/agent", {
        message: "Denied",
        agentId: "main",
      });
      expect(resDenied.status).toBe(400);
      const deniedBody = (await resDenied.json()) as { error?: string };
      expect(deniedBody.error).toContain("hooks.allowedAgentIds");

      const resMappedDenied = await postHook(port, "/hooks/mapped", { subject: "hello" });
      expect(resMappedDenied.status).toBe(400);
      const mappedDeniedBody = (await resMappedDenied.json()) as { error?: string };
      expect(mappedDeniedBody.error).toContain("hooks.allowedAgentIds");
      expect(peekSystemEvents(resolveMainKey()).length).toBe(0);
    });
  });

  test("denies explicit agentId when hooks.allowedAgentIds is empty", async () => {
    testState.hooksConfig = {
      enabled: true,
      token: HOOK_TOKEN,
      allowedAgentIds: [],
    };
    testState.agentsConfig = {
      list: [{ id: "main", default: true }, { id: "hooks" }],
    };
    await withGatewayServer(async ({ port }) => {
      const resDenied = await postHook(port, "/hooks/agent", {
        message: "Denied",
        agentId: "hooks",
      });
      expect(resDenied.status).toBe(400);
      const deniedBody = (await resDenied.json()) as { error?: string };
      expect(deniedBody.error).toContain("hooks.allowedAgentIds");
      expect(peekSystemEvents(resolveMainKey()).length).toBe(0);
    });
  });

  test("throttles repeated hook auth failures, and a successful auth before lockout resets the counter", async () => {
    // With the fail-closed ordering (`recordFailure` BEFORE `check`), the
    // limiter caps at HOOK_AUTH_FAILURE_LIMIT=20 attempts and locks out.
    // Once locked, even a valid token is throttled until the lockout
    // expires — this is intentional, since an attacker burst that
    // happens to include the right token shouldn't sneak through. To
    // verify the "reset on success" path, we stay BELOW the lockout
    // threshold, then succeed, and confirm a subsequent failure starts
    // counting fresh.
    testState.hooksConfig = { enabled: true, token: HOOK_TOKEN };
    await withGatewayServer(async ({ port }) => {
      const firstFail = await postHook(
        port,
        "/hooks/wake",
        { text: "blocked" },
        { token: "wrong" },
      );
      expect(firstFail.status).toBe(401);

      // 18 more failures = 19 total, leaving the bucket at 19/20 (one shy
      // of triggering the lockout).
      for (let i = 0; i < 18; i++) {
        const r = await postHook(port, "/hooks/wake", { text: "blocked" }, { token: "wrong" });
        expect(r.status).toBe(401);
      }

      // Valid auth — passes the un-locked limiter and clears the counter.
      const allowed = await postHook(port, "/hooks/wake", { text: "auth reset" });
      expect(allowed.status).toBe(200);
      await waitForSystemEvent();
      drainSystemEvents(resolveMainKey());

      // Counter was reset, so this fresh failure returns 401 (not 429).
      const failAfterSuccess = await postHook(
        port,
        "/hooks/wake",
        { text: "blocked" },
        { token: "wrong" },
      );
      expect(failAfterSuccess.status).toBe(401);

      // And we can still trigger the lockout afterward — fail 19 more times
      // to fill the bucket and confirm a 20th attempt locks out.
      let lastResponse: Response | null = null;
      for (let i = 0; i < 19; i++) {
        lastResponse = await postHook(port, "/hooks/wake", { text: "blocked" }, { token: "wrong" });
      }
      expect(lastResponse?.status).toBe(429);
      expect(lastResponse?.headers.get("retry-after")).toBeTruthy();
    });
  });

  test("rejects non-POST hook requests without consuming auth failure budget", async () => {
    testState.hooksConfig = { enabled: true, token: HOOK_TOKEN };
    await withGatewayServer(async ({ port }) => {
      let lastGet: Response | null = null;
      for (let i = 0; i < 21; i++) {
        lastGet = await fetch(`http://127.0.0.1:${port}/hooks/wake`, {
          method: "GET",
          headers: { Authorization: "Bearer wrong" },
        });
      }
      expect(lastGet?.status).toBe(405);
      expect(lastGet?.headers.get("allow")).toBe("POST");

      const allowed = await postHook(port, "/hooks/wake", { text: "still works" });
      expect(allowed.status).toBe(200);
      await waitForSystemEvent();
      drainSystemEvents(resolveMainKey());
    });
  });
});
