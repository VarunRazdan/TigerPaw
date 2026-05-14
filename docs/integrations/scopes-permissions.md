# Scopes and permissions

Each Tigerpaw integration requests a specific set of OAuth scopes (or, for service accounts, expects the same scopes to be allowlisted in the Workspace admin console). This page lists what every scope means and what Tigerpaw does with it. **Tigerpaw never asks for a scope it doesn't use.**

If you see a scope here you don't want to grant, you have two options:

1. Disconnect the integration and don't use the assistant tools that need that scope. Tigerpaw will remain functional minus those capabilities.
2. Open an issue describing the use case — sometimes a coarser scope can be replaced with a narrower one if the underlying API supports it.

## Gmail

OAuth2 group: Google. Service account: yes.

| Scope            | What it lets Tigerpaw do                         | Used by                                                                                 |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `gmail.readonly` | Read messages, threads, and labels               | `assistant_read_emails`, `assistant_read_email`, daily briefing                         |
| `gmail.send`     | Send new messages from your address              | `assistant_send_email`                                                                  |
| `gmail.compose`  | Create drafts                                    | (reserved — not currently used by Tigerpaw, but Google requires it for some send flows) |
| `gmail.modify`   | Mark messages read/unread, apply labels, archive | (reserved — used when the message-hub work lands)                                       |
| `userinfo.email` | Identify which Gmail account is connected        | shown in the Integrations page as the connection label                                  |

## Outlook Mail

OAuth2 group: Microsoft. Service account: not supported.

| Scope            | What it lets Tigerpaw do                   | Used by                                                   |
| ---------------- | ------------------------------------------ | --------------------------------------------------------- |
| `Mail.Read`      | Read messages and folders                  | `assistant_read_emails`, `assistant_read_email`           |
| `Mail.Send`      | Send new messages                          | `assistant_send_email`                                    |
| `Mail.ReadWrite` | Mark read/unread, move, delete             | (reserved)                                                |
| `User.Read`      | Identify the connected account             | connection label                                          |
| `offline_access` | Refresh access tokens without re-prompting | required by Microsoft for any long-lived OAuth connection |

## Google Calendar

OAuth2 group: Google. Service account: yes.

| Scope             | What it lets Tigerpaw do                                                                              | Used by                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `calendar`        | Read and write all calendars the user has access to                                                   | `assistant_list_calendar_events`, `..._create_`, `..._update_`, `..._delete_` |
| `calendar.events` | Read and write events specifically (narrower than `calendar` but Google requires both for some flows) | same as above                                                                 |
| `userinfo.email`  | Identify which account is connected                                                                   | connection label                                                              |

## Outlook Calendar

OAuth2 group: Microsoft. Service account: not supported.

| Scope                 | What it lets Tigerpaw do                                    | Used by                             |
| --------------------- | ----------------------------------------------------------- | ----------------------------------- |
| `Calendars.ReadWrite` | List, create, update, delete events on the user's calendars | all calendar tools                  |
| `User.Read`           | Identify the connected account                              | connection label                    |
| `offline_access`      | Refresh access tokens                                       | required for long-lived connections |

## Google Meet

OAuth2 group: Google. Service account: yes.

Google Meet uses the **Calendar API** to create events with conference data, so its scopes overlap with Google Calendar. If you've connected Google Calendar, Meet works automatically.

| Scope                         | What it lets Tigerpaw do                        | Used by                                       |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------- |
| `calendar`, `calendar.events` | Create calendar events with attached Meet links | `assistant_schedule_meeting` (Google variant) |
| `userinfo.email`              | Identify the host account                       | connection label                              |

## Microsoft Teams

OAuth2 group: Microsoft. Service account: not supported.

| Scope                      | What it lets Tigerpaw do                             | Used by                                      |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `OnlineMeetings.ReadWrite` | Create Teams meetings via Graph `/me/onlineMeetings` | `assistant_schedule_meeting` (Teams variant) |
| `User.Read`                | Identify the host account                            | connection label                             |
| `offline_access`           | Refresh access tokens                                | required                                     |

## Zoom

OAuth2 group: Zoom. Service account: not supported.

| Scope           | What it lets Tigerpaw do                    | Used by                                     |
| --------------- | ------------------------------------------- | ------------------------------------------- |
| `meeting:write` | Schedule new Zoom meetings                  | `assistant_schedule_meeting` (Zoom variant) |
| `meeting:read`  | List existing meetings, retrieve join links | (reserved)                                  |
| `user:read`     | Identify the connected Zoom user            | connection label                            |

## Jira

OAuth2 group: Atlassian. Service account: not supported.

| Scope             | What it lets Tigerpaw do                                      | Used by                                                                                             |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `read:jira-user`  | Read the connected user's profile (email, displayName)        | `/rest/api/3/myself` lookup at connect time (connection label) and any tool that resolves assignees |
| `read:jira-work`  | Read projects, issues, comments, transitions, search via JQL  | `jira.list_projects`, `jira.search_issues`, `jira.get_issue`, transition-name resolution            |
| `write:jira-work` | Create / update / transition issues and add comments          | `jira.create_issue`, `jira.update_issue`, `jira.transition_issue`, `jira.add_comment`               |
| `offline_access`  | Issue a rotating refresh token so Tigerpaw can renew silently | required by Atlassian for any long-lived OAuth connection                                           |

A few Jira specifics worth knowing:

- **Site scope.** A Jira OAuth 2.0 (3LO) app is granted access to one Atlassian site at a time. The site you grant on the Atlassian consent screen is the only one this connection can act on; the site name appears in the connection label so you can tell at a glance.
- **Plain text only (v1).** Issue descriptions and comments are wrapped in a minimal Atlassian Document Format (ADF) doc. Markdown is not interpreted — the literal text appears in Jira's body. Full ADF / Markdown support is a planned follow-up.
- **No board / sprint scopes (v1).** Tigerpaw doesn't currently request the Jira Software (`read:board-scope.admin:jira-software`, etc.) scopes. If you need board or sprint access, open an issue describing the use case.

## What Tigerpaw never asks for

For transparency:

- No drive / file storage scopes — Tigerpaw doesn't read your Drive.
- No contacts scopes — Tigerpaw doesn't enumerate your address book.
- No `mail.google.com` (full mailbox access) — Gmail integration uses the narrower `gmail.*` scopes.
- No admin-level Workspace scopes — even the service-account flow only impersonates a single named user per connection.

If you ever see a different consent screen on Google/Microsoft than the scopes listed here, treat it as a bug and open an issue. Tigerpaw should always match this page.
