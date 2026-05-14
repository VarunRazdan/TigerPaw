# Integrations

Tigerpaw connects to your email, calendar, meeting, and project-management providers so Jarvis can read and send mail, schedule events, create meeting links, and triage Jira issues on your behalf. All connections live on your machine — credentials never leave the host.

## Quick start

1. Open the dashboard at <http://127.0.0.1:18789> (or wherever your gateway listens).
2. Go to **Integrations**.
3. Click the provider you want to connect.
4. Follow the per-provider guide below — most flows take 5–10 minutes the first time you set up the OAuth app, and seconds after that.

## Supported integrations

| Provider         | Category     | OAuth2 | Service Account        | Setup guide                                  |
| ---------------- | ------------ | ------ | ---------------------- | -------------------------------------------- |
| Gmail            | Email        | Yes    | Yes (Google Workspace) | [gmail.md](./gmail.md)                       |
| Outlook Mail     | Email        | Yes    | No                     | [outlook-mail.md](./outlook-mail.md)         |
| Google Calendar  | Calendar     | Yes    | Yes (Google Workspace) | [google-calendar.md](./google-calendar.md)   |
| Outlook Calendar | Calendar     | Yes    | No                     | [outlook-calendar.md](./outlook-calendar.md) |
| Google Meet      | Meeting      | Yes    | Yes (Google Workspace) | [google-meet.md](./google-meet.md)           |
| Microsoft Teams  | Meeting      | Yes    | No                     | [microsoft-teams.md](./microsoft-teams.md)   |
| Zoom             | Meeting      | Yes    | No                     | [zoom.md](./zoom.md)                         |
| Jira             | Productivity | Yes    | No                     | [jira.md](./jira.md)                         |

## Cross-cutting guides

- [oauth-setup.md](./oauth-setup.md) — registering an OAuth app with Google, Microsoft, Zoom, or Atlassian (one-time setup per OAuth group).
- [service-account-setup.md](./service-account-setup.md) — Google Workspace service-account flow with domain-wide delegation. Use this when you want Tigerpaw to act on behalf of users across a Workspace tenant without individual consent.
- [scopes-permissions.md](./scopes-permissions.md) — exactly which permissions each integration requests and what Tigerpaw does with them.
- [troubleshooting.md](./troubleshooting.md) — common errors (`redirect_uri_mismatch`, `invalid_client`, expired tokens, missing scopes) and how to fix them.

## OAuth2 vs Service Account — which should I pick?

|                  | OAuth2                                            | Service Account                                                              |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Who can use it   | Anyone with a personal account                    | Google Workspace admins only                                                 |
| Per-user consent | Yes — each user clicks "Allow"                    | No — admin grants domain-wide delegation once                                |
| Setup complexity | Low (5 min)                                       | Medium (15 min, admin console access required)                               |
| Token refresh    | Automatic via refresh token                       | On-demand (signed JWT minted per request)                                    |
| When to use      | Personal use, single account, or per-user consent | Multi-user Workspace deployments where Tigerpaw acts on behalf of many users |

If you're not sure, start with OAuth2. You can switch to a service account later by disconnecting and reconnecting from the Integrations page.

## What Jarvis can do once connected

| Connection                 | Tools unlocked                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gmail / Outlook Mail       | `assistant_read_emails`, `assistant_read_email`, `assistant_send_email`                                                                                                        |
| Google / Outlook Calendar  | `assistant_list_calendar_events`, `assistant_create_calendar_event`, `assistant_update_calendar_event`, `assistant_delete_calendar_event`                                      |
| Zoom / Google Meet / Teams | `assistant_schedule_meeting` (creates an event with a join link)                                                                                                               |
| Jira                       | `jira.list_projects`, `jira.search_issues` (JQL), `jira.get_issue`, `jira.create_issue`, `jira.update_issue`, `jira.transition_issue`, `jira.add_comment`, `jira.delete_issue` |

You can verify a connection by asking Jarvis a small task like "check my unread emails" or "what's on my calendar today" from any messaging channel that's wired to the agent.
