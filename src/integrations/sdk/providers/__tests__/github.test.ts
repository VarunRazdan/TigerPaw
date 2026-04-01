/**
 * Tests for the GitHub integration provider.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAction, getTrigger } from "../../registry.js";
import type { AuthContext } from "../../types.js";

// Mock _utils to intercept fetchWithTimeout
vi.mock("../_utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../_utils.js")>();
  return {
    ...original,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "../_utils.js";

const mockFetch = vi.mocked(fetchWithTimeout);

function stubAuth(token = "test-github-token"): AuthContext {
  return {
    getAccessToken: async () => token,
    getCredentialField: () => undefined,
    credentials: {},
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

// Load once — module caching means re-import is a no-op
import "../github.js";

describe("GitHub Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── create_issue ────────────────────────────────────────────────

  describe("github.create_issue", () => {
    it("sends POST to correct endpoint with Bearer auth and request body", async () => {
      const responseBody = {
        number: 42,
        html_url: "https://github.com/owner/repo/issues/42",
        title: "Bug report",
        state: "open",
      };
      mockFetch.mockResolvedValue(makeResponse(responseBody, 201));

      const action = getAction("github", "github.create_issue")!;
      const result = await action.execute(
        {
          owner: "myorg",
          repo: "myrepo",
          title: "Bug report",
          body: "Something is broken",
          labels: "bug,urgent",
          assignees: "alice,bob",
        },
        stubAuth(),
      );

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/myorg/myrepo/issues",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-github-token",
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify request body
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]!.body as string);
      expect(requestBody).toEqual({
        title: "Bug report",
        body: "Something is broken",
        labels: ["bug", "urgent"],
        assignees: ["alice", "bob"],
      });

      // Verify response mapping
      expect(result.number).toBe(42);
      expect(result.html_url).toBe("https://github.com/owner/repo/issues/42");
      expect(result.title).toBe("Bug report");
      expect(result.state).toBe("open");
    });

    it("sends request without optional fields when omitted", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ number: 1, html_url: "url", title: "T", state: "open" }),
      );

      const action = getAction("github", "github.create_issue")!;
      await action.execute({ owner: "o", repo: "r", title: "Minimal issue" }, stubAuth());

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody.title).toBe("Minimal issue");
      expect(requestBody.body).toBeUndefined();
      expect(requestBody.labels).toBeUndefined();
      expect(requestBody.assignees).toBeUndefined();
    });
  });

  // ── comment_on_issue ────────────────────────────────────────────

  describe("github.comment_on_issue", () => {
    it("sends POST to correct endpoint with issue number", async () => {
      const responseBody = {
        id: 100,
        html_url: "https://github.com/owner/repo/issues/7#issuecomment-100",
      };
      mockFetch.mockResolvedValue(makeResponse(responseBody, 201));

      const action = getAction("github", "github.comment_on_issue")!;
      const result = await action.execute(
        {
          owner: "myorg",
          repo: "myrepo",
          issue_number: 7,
          body: "Looks good!",
        },
        stubAuth(),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/myorg/myrepo/issues/7/comments",
        expect.objectContaining({ method: "POST" }),
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(requestBody).toEqual({ body: "Looks good!" });

      expect(result.id).toBe(100);
      expect(result.html_url).toContain("issuecomment-100");
    });
  });

  // ── comment_on_pr ───────────────────────────────────────────────

  describe("github.comment_on_pr", () => {
    it("uses the issues endpoint because PRs are issues in GitHub API", async () => {
      const responseBody = {
        id: 200,
        html_url: "https://github.com/owner/repo/issues/15#issuecomment-200",
      };
      mockFetch.mockResolvedValue(makeResponse(responseBody, 201));

      const action = getAction("github", "github.comment_on_pr")!;
      const result = await action.execute(
        {
          owner: "myorg",
          repo: "myrepo",
          pull_number: 15,
          body: "LGTM!",
        },
        stubAuth(),
      );

      // PRs use the /issues/ endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/myorg/myrepo/issues/15/comments",
        expect.objectContaining({ method: "POST" }),
      );

      expect(result.id).toBe(200);
    });
  });

  // ── API error handling ──────────────────────────────────────────

  describe("API error handling", () => {
    it("returns a descriptive error with status code on API failure", async () => {
      mockFetch.mockResolvedValue(makeResponse({ message: "Not Found" }, 404));

      const action = getAction("github", "github.create_issue")!;

      await expect(
        action.execute({ owner: "myorg", repo: "missing", title: "Test" }, stubAuth()),
      ).rejects.toThrow(/github\.create_issue.*GitHub API error.*404/i);
    });

    it("wraps unexpected fetch errors", async () => {
      mockFetch.mockRejectedValue(new Error("DNS resolution failed"));

      const action = getAction("github", "github.create_issue")!;

      await expect(
        action.execute({ owner: "myorg", repo: "myrepo", title: "Test" }, stubAuth()),
      ).rejects.toThrow(/github\.create_issue.*DNS resolution failed/);
    });

    it("includes status code in comment_on_issue errors", async () => {
      mockFetch.mockResolvedValue(makeResponse({ message: "Unauthorized" }, 401));

      const action = getAction("github", "github.comment_on_issue")!;

      await expect(
        action.execute({ owner: "o", repo: "r", issue_number: 1, body: "test" }, stubAuth()),
      ).rejects.toThrow(/github\.comment_on_issue.*401/);
    });
  });

  // ── Webhook triggers ───────────────────────────────────────────

  describe("github.push webhook trigger", () => {
    it("parses a push event and returns commits", () => {
      const trigger = getTrigger("github", "github.push")!;
      expect(trigger.webhookParse).toBeDefined();

      const body = {
        ref: "refs/heads/main",
        commits: [
          { id: "abc123", message: "Fix bug" },
          { id: "def456", message: "Add feature" },
        ],
        pusher: { name: "alice" },
        repository: { full_name: "myorg/myrepo" },
      };
      const headers = { "x-github-event": "push" };

      const items = trigger.webhookParse!(body, headers);

      expect(items).toHaveLength(1);
      expect(items[0].event).toBe("push");
      expect(items[0].ref).toBe("refs/heads/main");
      expect(items[0].commits).toEqual([
        { id: "abc123", message: "Fix bug" },
        { id: "def456", message: "Add feature" },
      ]);
      expect(items[0].pusher).toEqual({ name: "alice" });
      expect(items[0].repository).toEqual({ full_name: "myorg/myrepo" });
    });

    it("returns empty array for non-push events (pull_request)", () => {
      const trigger = getTrigger("github", "github.push")!;

      const body = { action: "opened", number: 1 };
      const headers = { "x-github-event": "pull_request" };

      const items = trigger.webhookParse!(body, headers);
      expect(items).toEqual([]);
    });

    it("returns empty array for non-push events (issues)", () => {
      const trigger = getTrigger("github", "github.push")!;

      const body = { action: "opened", issue: { number: 5 } };
      const headers = { "x-github-event": "issues" };

      const items = trigger.webhookParse!(body, headers);
      expect(items).toEqual([]);
    });
  });

  describe("github.pull_request webhook trigger", () => {
    it("parses pull_request events", () => {
      const trigger = getTrigger("github", "github.pull_request")!;
      expect(trigger.webhookParse).toBeDefined();

      const body = {
        action: "opened",
        number: 10,
        pull_request: { title: "New PR", merged: false },
        repository: { full_name: "myorg/myrepo" },
      };
      const headers = { "x-github-event": "pull_request" };

      const items = trigger.webhookParse!(body, headers);
      expect(items).toHaveLength(1);
      expect(items[0].event).toBe("pull_request");
      expect(items[0].action).toBe("opened");
      expect(items[0].number).toBe(10);
    });

    it("returns empty array for push events", () => {
      const trigger = getTrigger("github", "github.pull_request")!;

      const items = trigger.webhookParse!({ ref: "refs/heads/main" }, { "x-github-event": "push" });
      expect(items).toEqual([]);
    });
  });
});
