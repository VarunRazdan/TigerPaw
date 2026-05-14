/**
 * Tests for the Jira SDK integration provider.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAction } from "../../registry.js";
import type { AuthContext } from "../../types.js";

vi.mock("../_utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../_utils.js")>();
  return {
    ...original,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "../_utils.js";

const mockFetch = vi.mocked(fetchWithTimeout);

function authWithCloud(cloudId?: string | null): AuthContext {
  const resolved = cloudId === undefined ? "cloud-abc" : cloudId;
  const fields: Record<string, string> = resolved
    ? {
        cloudId: resolved,
        baseUrl: `https://api.atlassian.com/ex/jira/${resolved}`,
        authScheme: "Bearer",
      }
    : {};
  return {
    getAccessToken: async () => "test-token",
    getCredentialField: (key: string) => fields[key],
    credentials: fields,
  };
}

function authWithApiToken(siteHost = "acme"): AuthContext {
  const baseUrl = `https://${siteHost}.atlassian.net`;
  const fields: Record<string, string> = {
    baseUrl,
    siteName: siteHost,
    siteUrl: baseUrl,
    authScheme: "Basic",
    accountEmail: "u@acme.com",
  };
  // Pre-encoded Basic blob — the same shape connectApiToken persists.
  const blob = Buffer.from("u@acme.com:abc123").toString("base64");
  return {
    getAccessToken: async () => blob,
    getCredentialField: (key: string) => fields[key],
    credentials: fields,
  };
}

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

// Trigger registration
import "../jira.js";

describe("Jira Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("jiraRequest baseUrl guard", () => {
    it("throws a clear error when baseUrl is missing", async () => {
      const action = getAction("jira", "jira.list_projects");
      expect(action).toBeDefined();
      await expect(action!.execute({}, authWithCloud(null))).rejects.toThrow(/baseUrl/i);
    });
  });

  describe("jiraRequest uses Basic auth + direct site URL for API token connections", () => {
    it("sends Authorization: Basic <token> to https://<site>.atlassian.net/...", async () => {
      mockFetch.mockResolvedValue(makeResponse({ values: [{ id: "1", key: "X", name: "X" }] }));
      const action = getAction("jira", "jira.list_projects")!;
      await action.execute({}, authWithApiToken());
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://acme.atlassian.net/rest/api/3/project/search?maxResults=50");
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
    });
  });

  describe("jira.list_projects", () => {
    it("hits /project/search and shapes the response", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          values: [
            { id: "1", key: "PROJ", name: "Project Alpha" },
            { id: "2", key: "OPS", name: "Ops" },
          ],
        }),
      );
      const action = getAction("jira", "jira.list_projects")!;
      const result = await action.execute({}, authWithCloud());
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/project/search?maxResults=50",
      );
      expect(result.projects).toEqual([
        { id: "1", key: "PROJ", name: "Project Alpha" },
        { id: "2", key: "OPS", name: "Ops" },
      ]);
    });
  });

  describe("jira.search_issues", () => {
    it("hits /search/jql (not deprecated /search) and shapes the response", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          isLast: true,
          nextPageToken: null,
          issues: [
            {
              id: "10001",
              key: "PROJ-1",
              fields: {
                summary: "Hi",
                status: { name: "Open" },
                assignee: { displayName: "Alice" },
                priority: { name: "High" },
                issuetype: { name: "Task" },
              },
            },
          ],
        }),
      );
      const action = getAction("jira", "jira.search_issues")!;
      const result = await action.execute(
        { jql: "project = PROJ", maxResults: 50 },
        authWithCloud(),
      );
      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toContain("/rest/api/3/search/jql?");
      expect(String(url)).not.toContain("/rest/api/3/search?");
      expect(String(url)).toContain("maxResults=50");
      expect(String(url)).toContain("jql=project");
      expect(result.isLast).toBe(true);
      expect(result.nextPageToken).toBeNull();
      expect((result.issues as Array<Record<string, unknown>>)[0]).toMatchObject({
        key: "PROJ-1",
        summary: "Hi",
        status: "Open",
        assignee: "Alice",
        priority: "High",
        issueType: "Task",
      });
    });

    it("caps maxResults at 100 and forwards nextPageToken when provided", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ isLast: false, nextPageToken: "tok-99", issues: [] }),
      );
      const action = getAction("jira", "jira.search_issues")!;
      const result = await action.execute(
        { jql: "x", maxResults: 500, nextPageToken: "prev-tok" },
        authWithCloud(),
      );
      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toContain("maxResults=100");
      expect(String(url)).toContain("nextPageToken=prev-tok");
      expect(result.isLast).toBe(false);
      expect(result.nextPageToken).toBe("tok-99");
    });
  });

  describe("jira.create_issue", () => {
    it("posts to /issue with ADF-wrapped description", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ key: "PROJ-2", id: "20002", self: "https://x/y" }, 201),
      );
      const action = getAction("jira", "jira.create_issue")!;
      await action.execute(
        {
          projectKey: "PROJ",
          summary: "New task",
          description: "Hello world",
          issueType: "Task",
        },
        authWithCloud(),
      );
      const [, init] = mockFetch.mock.calls[0];
      expect(init?.method).toBe("POST");
      const body = JSON.parse((init?.body ?? "") as string) as Record<string, unknown>;
      const fields = body.fields as Record<string, unknown>;
      expect(fields.project).toEqual({ key: "PROJ" });
      expect(fields.summary).toBe("New task");
      expect(fields.issuetype).toEqual({ name: "Task" });
      const desc = fields.description as Record<string, unknown>;
      expect(desc.type).toBe("doc");
      expect(desc.version).toBe(1);
      const paragraphs = desc.content as Array<Record<string, unknown>>;
      const textNodes = paragraphs[0].content as Array<Record<string, unknown>>;
      expect(textNodes[0]).toEqual({ type: "text", text: "Hello world" });
    });

    it("defaults issueType to Task when omitted", async () => {
      mockFetch.mockResolvedValue(makeResponse({ key: "PROJ-3", id: "30003" }, 201));
      const action = getAction("jira", "jira.create_issue")!;
      await action.execute({ projectKey: "PROJ", summary: "Untyped" }, authWithCloud());
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse((init?.body ?? "") as string) as Record<string, unknown>;
      const fields = body.fields as Record<string, unknown>;
      expect(fields.issuetype).toEqual({ name: "Task" });
    });
  });

  describe("jira.update_issue", () => {
    it("PUTs fields to /issue/{key}", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 204));
      const action = getAction("jira", "jira.update_issue")!;
      const result = await action.execute(
        { issueKey: "PROJ-1", summary: "Edited" },
        authWithCloud(),
      );
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/issue/PROJ-1");
      expect(init?.method).toBe("PUT");
      expect(result).toEqual({ updated: true, key: "PROJ-1" });
    });

    it("rejects update with no fields", async () => {
      const action = getAction("jira", "jira.update_issue")!;
      await expect(action.execute({ issueKey: "PROJ-1" }, authWithCloud())).rejects.toThrow(
        /No fields to update/i,
      );
    });
  });

  describe("jira.transition_issue", () => {
    it("looks up transitions then POSTs the matching id", async () => {
      mockFetch
        .mockResolvedValueOnce(
          makeResponse({
            transitions: [
              { id: "11", name: "To Do" },
              { id: "21", name: "In Progress" },
              { id: "31", name: "Done" },
            ],
          }),
        )
        .mockResolvedValueOnce(makeResponse({}, 204));

      const action = getAction("jira", "jira.transition_issue")!;
      const result = await action.execute(
        { issueKey: "PROJ-1", transitionName: "in progress" },
        authWithCloud(),
      );
      expect(result).toEqual({ transitioned: true, transitionId: "21" });

      const lookup = mockFetch.mock.calls[0];
      expect(lookup[0]).toBe(
        "https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/issue/PROJ-1/transitions",
      );
      const post = mockFetch.mock.calls[1];
      expect(post[1]?.method).toBe("POST");
      const body = JSON.parse((post[1]?.body ?? "") as string) as Record<string, unknown>;
      expect(body.transition).toEqual({ id: "21" });
    });

    it("throws when transition name has no match", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ transitions: [{ id: "11", name: "To Do" }] }));
      const action = getAction("jira", "jira.transition_issue")!;
      await expect(
        action.execute({ issueKey: "PROJ-1", transitionName: "fly to the moon" }, authWithCloud()),
      ).rejects.toThrow(/No transition named/);
    });
  });

  describe("jira.add_comment", () => {
    it("posts ADF-wrapped comment body to /issue/{key}/comment", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ id: "abc", created: "2026-01-01T00:00:00Z" }, 201),
      );
      const action = getAction("jira", "jira.add_comment")!;
      const result = await action.execute(
        { issueKey: "PROJ-1", body: "looks good" },
        authWithCloud(),
      );
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/issue/PROJ-1/comment",
      );
      const body = JSON.parse((init?.body ?? "") as string) as Record<string, unknown>;
      const adf = body.body as Record<string, unknown>;
      expect(adf.type).toBe("doc");
      expect(result).toEqual({ id: "abc", created: "2026-01-01T00:00:00Z" });
    });
  });

  describe("jira.delete_issue", () => {
    it("DELETEs to /issue/{key} with deleteSubtasks=false by default", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 204));
      const action = getAction("jira", "jira.delete_issue")!;
      const result = await action.execute({ issueKey: "PROJ-1" }, authWithCloud());
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/issue/PROJ-1?deleteSubtasks=false",
      );
      expect(init?.method).toBe("DELETE");
      expect(result).toEqual({ deleted: true, key: "PROJ-1" });
    });

    it("propagates deleteSubtasks=true when requested", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 204));
      const action = getAction("jira", "jira.delete_issue")!;
      await action.execute({ issueKey: "PROJ-2", deleteSubtasks: true }, authWithCloud());
      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toContain("?deleteSubtasks=true");
    });

    it("surfaces a clear error if Jira returns 4xx", async () => {
      mockFetch.mockResolvedValue(makeResponse({ errorMessages: ["forbidden"] }, 403));
      const action = getAction("jira", "jira.delete_issue")!;
      await expect(action.execute({ issueKey: "PROJ-1" }, authWithCloud())).rejects.toThrow(
        /\[jira\.delete_issue\]/,
      );
    });
  });
});
