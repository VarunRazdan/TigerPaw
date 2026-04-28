# Outlook Mail integration

Connect a Microsoft 365 / Outlook.com mailbox so Jarvis can read, search, and send email through Microsoft Graph.

## What this enables

- `assistant_read_emails` — list recent or unread messages.
- `assistant_read_email` — fetch a specific message.
- `assistant_send_email` — send mail from your address.
- Daily briefing — top unread subjects in your morning summary.

## Auth methods

OAuth2 only. Microsoft doesn't expose a service-account-style flow that grants delegated mail access without per-user consent the way Google's domain-wide delegation does. If you're a Microsoft 365 admin and need a non-interactive equivalent, look up "Application permissions" in Graph and consider a [committed-deploy script](https://learn.microsoft.com/en-us/graph/auth-v2-service) — that path isn't built into Tigerpaw today.

## OAuth2 setup

1. One-time Microsoft OAuth app registration: [oauth-setup.md → Microsoft](./oauth-setup.md#microsoft-outlook-mail-outlook-calendar-microsoft-teams). Make sure you added these Microsoft Graph **delegated** permissions:
   - `Mail.Read`
   - `Mail.Send`
   - `Mail.ReadWrite`
   - `User.Read`
   - `offline_access`
2. Open Tigerpaw → **Integrations** → **Outlook**. (There's no auth-method picker — Microsoft is OAuth2-only.)
3. Approve the consent screen. The Outlook card flips to connected.

Note: if your tenant has admin-consent-required policies enabled, an admin needs to grant consent once before users can connect. They can do that from Azure Portal → App registrations → your app → API permissions → **Grant admin consent for [tenant]**.

## Scopes

[scopes-permissions.md → Outlook Mail](./scopes-permissions.md#outlook-mail).

## Verifying it works

Ask Jarvis:

> "Check my unread emails."

If the integration is wired correctly you'll get a list of subjects and senders. Then:

> "Send a note to `teammate@example.com` saying 'Heads up — review meeting moved to 4pm.'"

Verify the message lands in their inbox.

## Limits and caveats

- Microsoft Graph rate-limits per app per tenant (~10,000 requests / 10 minutes). Plenty for personal use; Workspace deployments at scale may need to monitor.
- Personal Microsoft accounts and Microsoft 365 (work/school) accounts both work via the same `common` authority.
- Folder management, attachments, and search filters beyond unread/recent aren't yet exposed at the tool layer — `Mail.ReadWrite` is requested for forward compatibility.
- If you connect both Outlook Mail and Outlook Calendar, they share one OAuth app but each is a separate connection in Tigerpaw and each will refresh tokens independently.
