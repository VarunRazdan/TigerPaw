/**
 * GitHub integration — create issues, comment on PRs, and handle webhooks.
 *
 * Uses Personal Access Token (PAT) auth via the credential vault.
 */

import { registerIntegration } from "../registry.js";
import type { AuthContext, IntegrationDefinition } from "../types.js";
import { fetchWithTimeout, readJsonResponse, formatApiError, str } from "./_utils.js";

const GITHUB_API = "https://api.github.com";

async function githubRequest(
  auth: AuthContext,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = await auth.getAccessToken();
  const res = await fetchWithTimeout(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatApiError("GitHub", res.status, text));
  }

  return await readJsonResponse(res);
}

const definition: IntegrationDefinition = {
  id: "github",
  name: "GitHub",
  description: "Create issues, comment on PRs, and receive push/PR webhooks",
  icon: "github",
  category: "development",
  auth: {
    type: "api_key",
    headerName: "Authorization",
    headerPrefix: "Bearer",
    envVar: "GITHUB_TOKEN",
  },
  rateLimitPerMinute: 30, // GitHub REST API: 5000/hr ~ 83/min, but be conservative
  actions: [
    {
      name: "github.create_issue",
      displayName: "Create Issue",
      description: "Create a new issue in a GitHub repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner (user or org)", required: true },
          repo: { type: "string", description: "Repository name", required: true },
          title: { type: "string", description: "Issue title", required: true },
          body: { type: "string", description: "Issue body (Markdown)", format: "textarea" },
          labels: { type: "string", description: "Comma-separated label names" },
          assignees: { type: "string", description: "Comma-separated GitHub usernames" },
        },
        required: ["owner", "repo", "title"],
      },
      outputSchema: {
        type: "object",
        properties: {
          number: { type: "number", description: "Issue number" },
          html_url: { type: "string", description: "Issue URL" },
          title: { type: "string" },
          state: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const data = await githubRequest(
            auth,
            `/repos/${str(input.owner)}/${str(input.repo)}/issues`,
            "POST",
            {
              title: str(input.title),
              body: input.body ? str(input.body) : undefined,
              labels: input.labels
                ? str(input.labels)
                    .split(",")
                    .map((l) => l.trim())
                : undefined,
              assignees: input.assignees
                ? str(input.assignees)
                    .split(",")
                    .map((a) => a.trim())
                : undefined,
            },
          );
          return {
            number: data.number,
            html_url: data.html_url,
            title: data.title,
            state: data.state,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[github.create_issue] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "github.comment_on_issue",
      displayName: "Comment on Issue",
      description: "Add a comment to an existing issue",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner", required: true },
          repo: { type: "string", description: "Repository name", required: true },
          issue_number: { type: "number", description: "Issue number", required: true },
          body: {
            type: "string",
            description: "Comment body (Markdown)",
            format: "textarea",
            required: true,
          },
        },
        required: ["owner", "repo", "issue_number", "body"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Comment ID" },
          html_url: { type: "string", description: "Comment URL" },
        },
      },
      execute: async (input, auth) => {
        try {
          const data = await githubRequest(
            auth,
            `/repos/${str(input.owner)}/${str(input.repo)}/issues/${str(input.issue_number)}/comments`,
            "POST",
            { body: str(input.body) },
          );
          return { id: data.id, html_url: data.html_url };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[github.comment_on_issue] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "github.comment_on_pr",
      displayName: "Comment on Pull Request",
      description: "Add a comment to a pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner", required: true },
          repo: { type: "string", description: "Repository name", required: true },
          pull_number: { type: "number", description: "Pull request number", required: true },
          body: {
            type: "string",
            description: "Comment body (Markdown)",
            format: "textarea",
            required: true,
          },
        },
        required: ["owner", "repo", "pull_number", "body"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Comment ID" },
          html_url: { type: "string", description: "Comment URL" },
        },
      },
      execute: async (input, auth) => {
        try {
          // PRs are issues in GitHub API
          const data = await githubRequest(
            auth,
            `/repos/${str(input.owner)}/${str(input.repo)}/issues/${str(input.pull_number)}/comments`,
            "POST",
            { body: str(input.body) },
          );
          return { id: data.id, html_url: data.html_url };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[github.comment_on_pr] ${e.message}`, { cause: err });
        }
      },
    },
  ],
  triggers: [
    {
      name: "github.push",
      displayName: "Push Event",
      description: "Triggers on push to a repository (via webhook)",
      type: "webhook",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Webhook path", required: true },
          secret: {
            type: "string",
            description: "Webhook secret (for HMAC verification)",
            required: true,
          },
        },
        required: ["path", "secret"],
      },
      outputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Git ref (e.g. refs/heads/main)" },
          commits: { type: "array", description: "Array of commit objects" },
          pusher: { type: "object", description: "User who pushed" },
          repository: { type: "object", description: "Repository info" },
        },
      },
      webhookSetup: async (config) => ({
        path: str(config.path),
        secret: str(config.secret),
      }),
      webhookParse: (body, headers) => {
        const event = headers["x-github-event"];
        if (event !== "push") {
          return [];
        }
        return [
          {
            event: "push",
            ref: body.ref,
            commits: body.commits,
            pusher: body.pusher,
            repository: body.repository,
          },
        ];
      },
    },
    {
      name: "github.pull_request",
      displayName: "Pull Request Event",
      description: "Triggers on PR opened, closed, or merged (via webhook)",
      type: "webhook",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Webhook path", required: true },
          secret: { type: "string", description: "Webhook secret", required: true },
        },
        required: ["path", "secret"],
      },
      outputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "Event action (opened, closed, etc.)" },
          number: { type: "number" },
          pull_request: { type: "object" },
          repository: { type: "object" },
        },
      },
      webhookSetup: async (config) => ({
        path: str(config.path),
        secret: str(config.secret),
      }),
      webhookParse: (body, headers) => {
        const event = headers["x-github-event"];
        if (event !== "pull_request") {
          return [];
        }
        return [
          {
            event: "pull_request",
            action: body.action,
            number: body.number,
            pull_request: body.pull_request,
            repository: body.repository,
          },
        ];
      },
    },
    {
      name: "github.issue",
      displayName: "Issue Event",
      description: "Triggers on issue opened or closed (via webhook)",
      type: "webhook",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Webhook path", required: true },
          secret: { type: "string", description: "Webhook secret", required: true },
        },
        required: ["path", "secret"],
      },
      outputSchema: {
        type: "object",
        properties: {
          action: { type: "string" },
          issue: { type: "object" },
          repository: { type: "object" },
        },
      },
      webhookSetup: async (config) => ({
        path: str(config.path),
        secret: str(config.secret),
      }),
      webhookParse: (body, headers) => {
        const event = headers["x-github-event"];
        if (event !== "issues") {
          return [];
        }
        return [
          {
            event: "issue",
            action: body.action,
            issue: body.issue,
            repository: body.repository,
          },
        ];
      },
    },
  ],
};

registerIntegration(definition);
