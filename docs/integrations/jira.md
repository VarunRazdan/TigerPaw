# Jira integration

Connect Jira Cloud so Jarvis can read, create, update, transition, and comment on issues, plus run JQL searches across your projects.

## What this enables

- `jira.list_projects` — list projects accessible to the connected account.
- `jira.search_issues` — JQL search (e.g. `assignee = currentUser() AND status != Done`).
- `jira.get_issue` — fetch a single issue by key (e.g. `PROJ-123`).
- `jira.create_issue` — create an issue with summary, description, type, priority, assignee, labels.
- `jira.update_issue` — partial update of any of the above fields.
- `jira.transition_issue` — move an issue between workflow states by name (e.g. "In Progress"). Tigerpaw resolves the transition name to its numeric ID for you.
- `jira.add_comment` — append a comment to an issue.
- `jira.delete_issue` — permanently delete an issue (optional `deleteSubtasks` cascade). Destructive — cannot be undone.

## Auth methods

Two options. Tigerpaw will ask which you'd like when you click **Connect**.

| Method                  | Setup time | Best for                          | Notes                                                                                               |
| ----------------------- | ---------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| **API Token** (default) | ~30 sec    | Personal use, single account      | No app registration. Token is per-user from id.atlassian.com. Tokens expire (up to 1 year).         |
| **OAuth 2.0 (3LO)**     | ~5–10 min  | Org / team deployment, multi-user | Requires a one-time OAuth app registered in the Atlassian Developer Console. Refresh tokens rotate. |

Either works against the same Jira REST v3 API and unlocks the same 8 actions; the only differences are the setup flow and what's persisted on disk. Switching between methods is a disconnect + reconnect.

## API Token setup (fast path)

1. Open Tigerpaw → **Integrations** → **Productivity** → **Jira** → **Connect**.
2. In the auth method picker, choose **API Token (Faster)** and click **Continue**.
3. Generate a token at [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) (label it "Tigerpaw"; either classic or scoped tokens work).
4. Paste your **Jira site URL** (`https://your-site.atlassian.net`), **Atlassian email**, and the **API token**, then click **Save & Connect**.
5. The token is validated against `/rest/api/3/myself` before persisting — if Atlassian rejects it, you'll see a 401 error inline rather than a silent failure.

## OAuth 2.0 setup

1. One-time Atlassian OAuth app: [oauth-setup.md → Atlassian (Jira)](./oauth-setup.md#atlassian-jira). Required scopes:
   - `read:jira-user`
   - `read:jira-work`
   - `write:jira-work`
   - `offline_access`
2. Open Tigerpaw → **Integrations** → **Productivity** → **Jira** → **Connect**.
3. In the auth method picker, choose **Sign in with Atlassian** and click **Continue**.
4. If you haven't entered Atlassian Client ID + Secret yet, the OAuth Setup dialog appears — paste them and **Save**. Then click **Connect** on the Jira tile again.
5. Approve the Atlassian consent screen. If your account has multiple Jira sites, pick the one you want Tigerpaw to act on — only that site is reachable from this connection.

In both flows the connection label shows `<Site Name> — <your email>` so you can tell at a glance which site this connection is bound to.

## Scopes

[scopes-permissions.md → Jira](./scopes-permissions.md#jira).

## Verifying it works

Ask Jarvis:

> "List my Jira projects."

Jarvis should reply with the project keys and names from your connected site. Follow up with:

> "Create a Jira issue in PROJ titled 'Test from Jarvis' with description 'Hello world'."

Confirm the issue appears in your Jira backlog under the project you specified.

## Limits and caveats

- **One Jira site per connection (v1).** Atlassian OAuth grants per-site, not per-account. To switch sites, disconnect and reconnect; you'll pick the site on the Atlassian consent screen.
- **Plain text only for issue body and comments.** Tigerpaw wraps the text you provide in a minimal Atlassian Document Format (ADF) doc — Markdown is not interpreted. Full rich-text / ADF support is a planned follow-up.
- **Transitions are looked up by name on each call.** Pass the human-readable transition name (e.g. "In Progress") — Tigerpaw fetches the available transitions for the issue and resolves it to the correct numeric ID. If the name doesn't match (case-insensitive), the error message lists the available transitions for that issue.
- **First 50 projects only (v1).** `jira.list_projects` returns the first page of results. If you have more than 50 projects and need a specific one, reference it by key directly (e.g. in JQL).
- **No board / sprint tools yet (v1).** Jira Software-specific scopes (`read:board-scope.admin:jira-software`, etc.) aren't requested. Open an issue if you need agile-board operations.
- **No webhooks / triggers yet.** Inbound events (issue created, status changed) aren't wired into workflow triggers in this release.

## Troubleshooting

| Symptom                                                                   | Likely cause                                                                                                    | Fix                                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Connect dialog says `jira_no_accessible_resources`                        | The Atlassian account you authenticated as has no Jira site this OAuth app can reach.                           | Install the app on a site you administer (Atlassian Developer Console → Distribution), or pick a different account. |
| `Jira connection is missing its cloudId — disconnect and reconnect Jira.` | The connection was created before the cloudId-discovery code landed, or `accessible-resources` failed silently. | Disconnect from the Integrations page, then connect again.                                                          |
| 403 from any action                                                       | A scope is missing.                                                                                             | Re-check the four scopes on the Atlassian app and reconnect — the new scopes only apply on the next consent grant.  |
| `No transition named "..."`                                               | Workflow transition names are case-insensitive but must match exactly.                                          | The error message lists what's available for that issue — copy one of those names.                                  |
