# Google Calendar integration

Connect Google Calendar so Jarvis can list, create, and modify events on your calendars.

## What this enables

- `assistant_list_calendar_events` — events in a date range, with attendees and meeting links.
- `assistant_create_calendar_event` — schedule a new event, optionally with a Google Meet link attached.
- `assistant_update_calendar_event` — change an existing event's time, attendees, or description.
- `assistant_delete_calendar_event` — cancel an event.
- Daily briefing — today's events listed in your morning summary.

## Auth methods

| Method          | Best for                                                                           |
| --------------- | ---------------------------------------------------------------------------------- |
| OAuth2          | Personal accounts and single-user setups                                           |
| Service account | Google Workspace tenants where Tigerpaw manages calendars on behalf of named users |

## OAuth2 setup

1. One-time Google OAuth app setup: [oauth-setup.md → Google](./oauth-setup.md#google-gmail-google-calendar-google-meet).
2. Open Tigerpaw → **Integrations** → **Google Calendar** → **OAuth2 (User Consent)**.
3. Approve the consent screen. The Google Calendar card flips to connected.

## Service account setup

See [service-account-setup.md](./service-account-setup.md). Calendar-specific notes:

- Enable the **Google Calendar API** in the Cloud Console project.
- Authorize these scopes in the Workspace admin console:
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/userinfo.email`
- Impersonate email = the user whose calendars Tigerpaw should read and write.

> Tip: if you also want Google Meet, you don't need a separate setup — Meet uses these same scopes via the Calendar API.

## Scopes

[scopes-permissions.md → Google Calendar](./scopes-permissions.md#google-calendar).

## Verifying it works

Ask Jarvis:

> "What's on my calendar today?"

You should get today's events with start times and meeting links if any.

Then:

> "Schedule a 30-minute meeting tomorrow at 10am with `example@gmail.com` about Q1 planning."

You should see the event appear in your Google Calendar within seconds.

## Limits and caveats

- Tigerpaw lists up to 25 events per `assistant_list_calendar_events` call by default. For multi-week ranges this is a soft limit; ask for a narrower window if you hit it.
- The integration uses your **primary** calendar by default. Multi-calendar selection (work + personal) is a planned enhancement.
- Recurring events: created events default to single occurrences. Updating a single instance vs the whole series isn't yet exposed at the tool layer.
- Free/busy queries and find-a-time across attendees aren't yet exposed; planned for a follow-up.
