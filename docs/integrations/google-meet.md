# Google Meet integration

Connect Google Meet to schedule meetings with auto-generated Meet join links.

## How it works

Google Meet doesn't have its own OAuth API surface — Meet links are created as part of Google Calendar events with `conferenceData`. Tigerpaw uses the Calendar API under the hood, so:

- The setup is the same as Google Calendar (same OAuth app, same scopes).
- If you've already connected Google Calendar, Google Meet automatically works for scheduling. The separate Google Meet card on the Integrations page is mostly a discoverability surface.

## What this enables

- `assistant_schedule_meeting` (Google Meet variant) — creates a calendar event with `conferenceData.createRequest` so Google attaches a Meet link, then returns the join URL.

## Auth methods

| Method          | Best for          |
| --------------- | ----------------- |
| OAuth2          | Personal accounts |
| Service account | Workspace tenants |

## OAuth2 setup

If you haven't already connected Google Calendar:

1. One-time Google OAuth app setup: [oauth-setup.md → Google](./oauth-setup.md#google-gmail-google-calendar-google-meet).
2. Open Tigerpaw → **Integrations** → **Google Meet** → **OAuth2 (User Consent)** → approve consent.

If Google Calendar is already connected, Meet uses that connection — clicking the Meet card shows it as already configured.

## Service account setup

Same as Calendar: see [service-account-setup.md](./service-account-setup.md). The required scopes are identical to Google Calendar (`calendar`, `calendar.events`, `userinfo.email`).

## Scopes

Same as [Google Calendar](./scopes-permissions.md#google-calendar).

## Verifying it works

Ask Jarvis:

> "Schedule a Meet for tomorrow at 2pm with `alice@example.com` — call it 'Sync up'."

You should see:

1. The event in Google Calendar with `Meet` listed under Conferencing.
2. Jarvis returns the Meet join URL in its reply.

## Limits and caveats

- Meet links are tied to the calendar event. Deleting the event removes the link.
- Recording, breakout rooms, and other paid Workspace Meet features aren't exposed by the tool — Jarvis only schedules and returns the join link.
- The host account is whichever account owns the calendar event (your account for OAuth2, the impersonate email for SA).
