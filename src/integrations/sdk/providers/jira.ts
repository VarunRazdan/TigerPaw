/**
 * Jira Cloud integration — read, create, update, transition, comment on, and
 * search Jira issues via the REST v3 API.
 *
 * Auth: OAuth 2.0 (3LO) via Atlassian's authorization server. After token
 * exchange, the cloudId of the user's selected site is discovered via
 * `accessible-resources` (handled by oauth2.ts) and persisted on the
 * connection's `config` — exposed here through `auth.getCredentialField("cloudId")`.
 */

import { registerIntegration } from "../registry.js";
import type { AuthContext, IntegrationDefinition } from "../types.js";
import { fetchWithTimeout, formatApiError, readJsonResponse, str } from "./_utils.js";

async function jiraRequest(
  auth: AuthContext,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = await auth.getAccessToken();
  // Two authentication paths share this helper:
  //   - OAuth 2.0 (3LO):  baseUrl=https://api.atlassian.com/ex/jira/{cloudId},
  //                       authScheme="Bearer"
  //   - API token (Basic): baseUrl=https://<site>.atlassian.net,
  //                        authScheme="Basic"
  // Both are set at connect time and persisted on connection.config; the
  // helper reads them via the auth context so all 7 actions work uniformly.
  const baseUrl = auth.getCredentialField("baseUrl");
  if (!baseUrl) {
    throw new Error("Jira connection is missing its baseUrl — disconnect and reconnect Jira.");
  }
  const authScheme = auth.getCredentialField("authScheme") || "Bearer";
  const url = `${baseUrl}/rest/api/3${path}`;
  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `${authScheme} ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatApiError("Jira", res.status, text));
  }
  // 204 No Content (e.g. transitions) — return empty record.
  if (res.status === 204) {
    return {};
  }
  return readJsonResponse(res);
}

/**
 * Wrap plain text in Atlassian Document Format (ADF) — the only rich-text
 * shape the Jira REST v3 API accepts for description and comment bodies.
 * v1 supports plain text only; Markdown / full ADF will come later.
 */
function textToAdf(text: string): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function buildIssueFields(input: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.projectKey !== undefined) {
    fields.project = { key: str(input.projectKey) };
  }
  if (input.summary !== undefined) {
    fields.summary = str(input.summary);
  }
  if (input.description !== undefined && str(input.description).length > 0) {
    fields.description = textToAdf(str(input.description));
  }
  if (input.issueType !== undefined && str(input.issueType).length > 0) {
    fields.issuetype = { name: str(input.issueType) };
  }
  if (input.priority !== undefined && str(input.priority).length > 0) {
    fields.priority = { name: str(input.priority) };
  }
  if (input.assigneeAccountId !== undefined && str(input.assigneeAccountId).length > 0) {
    fields.assignee = { accountId: str(input.assigneeAccountId) };
  }
  if (input.labels !== undefined && str(input.labels).length > 0) {
    fields.labels = str(input.labels)
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
  return fields;
}

const definition: IntegrationDefinition = {
  id: "jira",
  name: "Jira",
  description: "Read, create, update, comment on, transition, and search Jira Cloud issues",
  icon: "jira",
  category: "productivity",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: ["read:jira-user", "read:jira-work", "write:jira-work", "offline_access"],
    clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
    clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
    extraAuthParams: { audience: "api.atlassian.com" },
    usePkce: false,
    useGoogleOfflineAccess: false,
  },
  rateLimitPerMinute: 50,
  actions: [
    {
      name: "jira.list_projects",
      displayName: "List Projects",
      description: "List Jira projects accessible to this connection (first 50)",
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: {
          projects: {
            type: "array",
            description: "Array of { id, key, name }",
          },
        },
      },
      execute: async (_input, auth) => {
        try {
          const data = await jiraRequest(auth, "/project/search?maxResults=50");
          const values = Array.isArray(data.values)
            ? (data.values as Array<Record<string, unknown>>)
            : [];
          return {
            projects: values.map((p) => ({
              id: p.id,
              key: p.key,
              name: p.name,
            })),
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.list_projects] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.search_issues",
      displayName: "Search Issues (JQL)",
      description:
        "Search issues by JQL (e.g. `project = PROJ AND status = Open`). Uses the new enhanced search endpoint with cursor-based pagination — pass `nextPageToken` from the previous response to fetch the next page.",
      inputSchema: {
        type: "object",
        properties: {
          jql: { type: "string", description: "JQL query string", required: true },
          maxResults: {
            type: "number",
            description: "Max results per page (1-100, default 50)",
            default: 50,
          },
          nextPageToken: {
            type: "string",
            description: "Pagination cursor from a previous response (optional)",
          },
        },
        required: ["jql"],
      },
      outputSchema: {
        type: "object",
        properties: {
          issues: { type: "array", description: "Array of issue summaries" },
          isLast: { type: "boolean", description: "True when this is the final page" },
          nextPageToken: {
            type: "string",
            description: "Cursor for the next page (absent on last page)",
          },
        },
      },
      execute: async (input, auth) => {
        try {
          // Atlassian deprecated `/rest/api/3/search` in favor of
          // `/rest/api/3/search/jql` — cursor pagination (nextPageToken),
          // no `total`. https://developer.atlassian.com/changelog/#CHANGE-2046
          const max = Math.min(100, Math.max(1, Number(input.maxResults ?? 50) || 50));
          const params = new URLSearchParams({
            jql: str(input.jql),
            maxResults: String(max),
            fields: "summary,status,assignee,priority,issuetype",
          });
          if (typeof input.nextPageToken === "string" && input.nextPageToken.length > 0) {
            params.set("nextPageToken", input.nextPageToken);
          }
          const data = await jiraRequest(auth, `/search/jql?${params.toString()}`);
          const issues = Array.isArray(data.issues)
            ? (data.issues as Array<Record<string, unknown>>)
            : [];
          return {
            issues: issues.map((i) => {
              const fields = (i.fields as Record<string, unknown>) ?? {};
              const status = fields.status as Record<string, unknown> | undefined;
              const assignee = fields.assignee as Record<string, unknown> | undefined;
              const priority = fields.priority as Record<string, unknown> | undefined;
              const issuetype = fields.issuetype as Record<string, unknown> | undefined;
              return {
                key: i.key,
                id: i.id,
                summary: fields.summary,
                status: status?.name,
                assignee: assignee?.displayName,
                priority: priority?.name,
                issueType: issuetype?.name,
              };
            }),
            isLast: data.isLast === true || data.nextPageToken == null,
            nextPageToken: data.nextPageToken ?? null,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.search_issues] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.get_issue",
      displayName: "Get Issue",
      description: "Fetch a single issue by key (e.g. PROJ-123)",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: { type: "string", description: "Issue key, e.g. PROJ-123", required: true },
        },
        required: ["issueKey"],
      },
      outputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          summary: { type: "string" },
          status: { type: "string" },
          assignee: { type: "string" },
          description: { type: "object", description: "Raw ADF document" },
        },
      },
      execute: async (input, auth) => {
        try {
          const data = await jiraRequest(auth, `/issue/${encodeURIComponent(str(input.issueKey))}`);
          const fields = (data.fields as Record<string, unknown>) ?? {};
          const status = fields.status as Record<string, unknown> | undefined;
          const assignee = fields.assignee as Record<string, unknown> | undefined;
          return {
            key: data.key,
            id: data.id,
            summary: fields.summary,
            status: status?.name,
            assignee: assignee?.displayName,
            description: fields.description,
            url: `${str(data.self).split("/rest/")[0]}/browse/${str(data.key)}`,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.get_issue] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.create_issue",
      displayName: "Create Issue",
      description:
        "Create a new Jira issue. Description is plain text (wrapped in Atlassian Document Format) — Markdown not supported.",
      inputSchema: {
        type: "object",
        properties: {
          projectKey: { type: "string", description: "Project key (e.g. PROJ)", required: true },
          summary: { type: "string", description: "Issue title", required: true },
          description: {
            type: "string",
            description: "Issue description (plain text)",
            format: "textarea",
          },
          issueType: { type: "string", description: "Issue type name", default: "Task" },
          priority: { type: "string", description: "Priority name (e.g. High)" },
          assigneeAccountId: { type: "string", description: "Atlassian accountId to assign" },
          labels: { type: "string", description: "Comma-separated labels" },
        },
        required: ["projectKey", "summary"],
      },
      outputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "New issue key" },
          id: { type: "string" },
          self: { type: "string", description: "API URL" },
        },
      },
      execute: async (input, auth) => {
        try {
          const fields = buildIssueFields({
            ...input,
            issueType: input.issueType ?? "Task",
          });
          const data = await jiraRequest(auth, "/issue", "POST", { fields });
          return { key: data.key, id: data.id, self: data.self };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.create_issue] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.update_issue",
      displayName: "Update Issue",
      description: "Update fields on an existing Jira issue (partial update)",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: { type: "string", description: "Issue key, e.g. PROJ-123", required: true },
          summary: { type: "string", description: "New summary" },
          description: {
            type: "string",
            description: "New description (plain text)",
            format: "textarea",
          },
          issueType: { type: "string", description: "Issue type name" },
          priority: { type: "string", description: "Priority name" },
          assigneeAccountId: { type: "string", description: "Atlassian accountId" },
          labels: { type: "string", description: "Comma-separated labels (replaces existing)" },
        },
        required: ["issueKey"],
      },
      outputSchema: {
        type: "object",
        properties: {
          updated: { type: "boolean" },
          key: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const { issueKey, ...rest } = input;
          const fields = buildIssueFields(rest);
          if (Object.keys(fields).length === 0) {
            throw new Error("No fields to update");
          }
          await jiraRequest(auth, `/issue/${encodeURIComponent(str(issueKey))}`, "PUT", { fields });
          return { updated: true, key: str(issueKey) };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.update_issue] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.transition_issue",
      displayName: "Transition Issue",
      description:
        'Move an issue to a different workflow state by transition name (e.g. "In Progress")',
      inputSchema: {
        type: "object",
        properties: {
          issueKey: { type: "string", description: "Issue key, e.g. PROJ-123", required: true },
          transitionName: {
            type: "string",
            description: "Transition display name (case-insensitive)",
            required: true,
          },
        },
        required: ["issueKey", "transitionName"],
      },
      outputSchema: {
        type: "object",
        properties: {
          transitioned: { type: "boolean" },
          transitionId: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const issueKey = encodeURIComponent(str(input.issueKey));
          const wantedName = str(input.transitionName).toLowerCase();
          const list = await jiraRequest(auth, `/issue/${issueKey}/transitions`);
          const transitions = Array.isArray(list.transitions)
            ? (list.transitions as Array<Record<string, unknown>>)
            : [];
          const match = transitions.find((t) => str(t.name).toLowerCase() === wantedName);
          if (!match) {
            const available = transitions.map((t) => str(t.name)).join(", ");
            throw new Error(
              `No transition named "${str(input.transitionName)}" on this issue. Available: ${available}`,
            );
          }
          await jiraRequest(auth, `/issue/${issueKey}/transitions`, "POST", {
            transition: { id: str(match.id) },
          });
          return { transitioned: true, transitionId: str(match.id) };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.transition_issue] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.add_comment",
      displayName: "Add Comment",
      description: "Add a plain-text comment to an issue (wrapped in Atlassian Document Format)",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: { type: "string", description: "Issue key, e.g. PROJ-123", required: true },
          body: {
            type: "string",
            description: "Comment body (plain text)",
            format: "textarea",
            required: true,
          },
        },
        required: ["issueKey", "body"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Comment ID" },
          created: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const data = await jiraRequest(
            auth,
            `/issue/${encodeURIComponent(str(input.issueKey))}/comment`,
            "POST",
            { body: textToAdf(str(input.body)) },
          );
          return { id: data.id, created: data.created };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.add_comment] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "jira.delete_issue",
      displayName: "Delete Issue",
      description:
        "Permanently delete a Jira issue. Optionally cascade-delete its subtasks. **Destructive — cannot be undone.**",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: { type: "string", description: "Issue key, e.g. PROJ-123", required: true },
          deleteSubtasks: {
            type: "boolean",
            description:
              "When true, also delete any subtasks. When false (default), the call fails if the issue has subtasks.",
            default: false,
          },
        },
        required: ["issueKey"],
      },
      outputSchema: {
        type: "object",
        properties: {
          deleted: { type: "boolean" },
          key: { type: "string" },
        },
      },
      execute: async (input, auth) => {
        try {
          const issueKey = encodeURIComponent(str(input.issueKey));
          // Atlassian's DELETE expects the literal strings "true"/"false" for
          // the deleteSubtasks query param (it's typed as enum, not boolean).
          const deleteSubtasks = input.deleteSubtasks === true ? "true" : "false";
          await jiraRequest(auth, `/issue/${issueKey}?deleteSubtasks=${deleteSubtasks}`, "DELETE");
          return { deleted: true, key: str(input.issueKey) };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[jira.delete_issue] ${e.message}`, { cause: err });
        }
      },
    },
  ],
  triggers: [],
};

registerIntegration(definition);
