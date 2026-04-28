# Microsoft Teams integration

Connect Microsoft Teams so Jarvis can schedule meetings and return join links via Microsoft Graph's `onlineMeetings` API.

## What this enables

- `assistant_schedule_meeting` (Teams variant) — create a Teams meeting and return the join URL.

## Auth methods

OAuth2 only.

## OAuth2 setup

1. One-time Microsoft OAuth app registration: [oauth-setup.md → Microsoft](./oauth-setup.md#microsoft-outlook-mail-outlook-calendar-microsoft-teams). Required Graph **delegated** permission:
   - `OnlineMeetings.ReadWrite`
   - `User.Read`
   - `offline_access`
2. Open Tigerpaw → **Integrations** → **Microsoft Teams**.
3. Approve the consent screen.

> The Microsoft Graph `OnlineMeetings.ReadWrite` permission is "delegated" but in many tenants requires admin consent. If you see a "needs admin approval" message during the consent step, ask your IT admin to click **Grant admin consent for [tenant]** on the OAuth app's API permissions page in Azure Portal.

## Scopes

[scopes-permissions.md → Microsoft Teams](./scopes-permissions.md#microsoft-teams).

## Verifying it works

Ask Jarvis:

> "Schedule a Teams meeting at 11am tomorrow with `bob@example.com` about onboarding."

Jarvis should reply with the join URL. Confirm the meeting in your Teams calendar.

## Limits and caveats

- The Graph `onlineMeetings` API only supports creating meetings — it doesn't auto-add a corresponding entry to the host's calendar. (Calendar+meeting events are an Outlook Calendar API call; if you want both, also connect Outlook Calendar and Jarvis can string them together.)
- The host is the connected user. Cross-tenant meetings (host in tenant A, guests in tenant B) work but follow your tenant's external-sharing policies.
- Recordings, transcription, and breakout rooms aren't exposed at the tool layer.
- If your tenant has Conditional Access policies, the OAuth flow may bounce through MFA — Tigerpaw doesn't have a way to pre-stage MFA, so just complete it in the consent popup.
