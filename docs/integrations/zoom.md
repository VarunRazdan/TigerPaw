# Zoom integration

Connect Zoom so Jarvis can schedule meetings and return join links.

## What this enables

- `assistant_schedule_meeting` (Zoom variant) — create a Zoom meeting and return the join URL + passcode.

Listing existing meetings and cancelling them via tool calls aren't yet exposed; the `meeting:read` scope is reserved for that future capability.

## Auth methods

OAuth2 only. Zoom historically had a JWT app type that resembled a service account; it's deprecated in favor of OAuth + Server-to-Server OAuth, neither of which Tigerpaw currently uses for impersonation.

## OAuth2 setup

1. One-time Zoom OAuth app: [oauth-setup.md → Zoom](./oauth-setup.md#zoom). Required scopes:
   - `meeting:write`
   - `meeting:read`
   - `user:read`
2. Open Tigerpaw → **Integrations** → **Zoom**.
3. Approve the consent screen.

> Zoom's marketplace requires an "OAuth Allow List" entry as well as the redirect URI. Add your Tigerpaw callback URI to _both_ fields in the app settings; missing the allow-list entry produces a generic error during the consent flow.

## Scopes

[scopes-permissions.md → Zoom](./scopes-permissions.md#zoom).

## Verifying it works

Ask Jarvis:

> "Schedule a Zoom call at 3pm tomorrow titled 'Customer review'."

Jarvis should reply with a join URL and passcode. Confirm the meeting appears under **Meetings** in your Zoom web portal.

## Limits and caveats

- Tigerpaw schedules **scheduled** meetings (not instant) — they have a fixed start time and duration.
- The host of the Zoom meeting is whichever Zoom account is connected. There's currently no way to pick a different host per meeting.
- Account-level features (waiting room, registration, recording defaults) follow your Zoom account's defaults — Tigerpaw doesn't override them.
- Free Zoom accounts cap meetings at 40 minutes for 3+ participants. Tigerpaw doesn't enforce this; Zoom does, when the meeting runs.
- The publishable scope list in the Zoom Marketplace varies by app type. `meeting:write`, `meeting:read`, `user:read` are the minimum for a "User-managed app".
