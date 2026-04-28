# Outlook Calendar integration

Connect a Microsoft 365 / Outlook.com calendar so Jarvis can list, create, and modify events.

## What this enables

- `assistant_list_calendar_events` — events in a date range, including online-meeting links.
- `assistant_create_calendar_event` — schedule a new event.
- `assistant_update_calendar_event` — change an existing event.
- `assistant_delete_calendar_event` — cancel an event.
- Daily briefing — today's events.

## Auth methods

OAuth2 only. (Microsoft has no domain-wide-delegation equivalent for delegated-permission flows.)

## OAuth2 setup

1. One-time Microsoft OAuth app registration: [oauth-setup.md → Microsoft](./oauth-setup.md#microsoft-outlook-mail-outlook-calendar-microsoft-teams). Required Graph **delegated** permissions:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
2. Open Tigerpaw → **Integrations** → **Outlook Calendar**.
3. Approve the consent screen.

## Scopes

[scopes-permissions.md → Outlook Calendar](./scopes-permissions.md#outlook-calendar).

## Verifying it works

Ask Jarvis:

> "What's on my calendar tomorrow?"

Then:

> "Schedule a 30-minute focus block at 10am tomorrow titled 'Deep work'."

You should see the event in Outlook within seconds.

## Limits and caveats

- The integration uses your **primary** calendar (`/me/events`). Switching between Personal and Work calendars within one Microsoft account isn't exposed yet.
- Recurrence patterns: created events are single occurrences. Editing a single instance of a recurring meeting vs the whole series isn't yet exposed at the tool layer.
- Free/busy queries and `findMeetingTimes` aren't yet exposed.
- If you connect Outlook Mail and Outlook Calendar, both use the same OAuth app but appear as separate connections — disconnecting one doesn't disconnect the other.
