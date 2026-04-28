# Gmail integration

Connect Gmail to Tigerpaw so Jarvis can read, search, and send email on your behalf.

## What this enables

- `assistant_read_emails` — list recent or unread messages.
- `assistant_read_email` — fetch a specific message in full.
- `assistant_send_email` — send mail from your address.
- Daily briefing (if enabled) — top unread subjects and counts in your morning summary.

## Auth methods

| Method          | Best for                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| OAuth2          | Personal accounts and single-user setups                                    |
| Service account | Google Workspace tenants where Tigerpaw should act on behalf of named users |

## OAuth2 setup

1. Make sure you've registered a Google OAuth app once. If not, follow [oauth-setup.md → Google](./oauth-setup.md#google-gmail-google-calendar-google-meet) — you only do this part one time per Tigerpaw install.
2. Open Tigerpaw → **Integrations** → **Gmail** → choose **OAuth2 (User Consent)** in the auth picker.
3. A popup opens to Google's consent screen. Sign in and approve the requested scopes.
4. The popup closes and the Gmail card shows your email address with a green dot.

If the popup doesn't open, your browser blocked it — allow popups for the Tigerpaw URL and try again.

## Service account setup

For Workspace deployments. See [service-account-setup.md](./service-account-setup.md) for the full walkthrough. Gmail-specific notes:

- Enable the **Gmail API** in the Cloud Console project.
- Authorize these scopes in the Workspace admin console:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.compose`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/userinfo.email`
- The **Impersonate email** in Tigerpaw's SA dialog is the user whose mailbox Jarvis will read and send from.

## Scopes

Full list with explanations: [scopes-permissions.md → Gmail](./scopes-permissions.md#gmail).

The shortest meaningful summary: Tigerpaw asks for read access (`gmail.readonly`), send access (`gmail.send`), and the ability to identify your account (`userinfo.email`). It doesn't ask for full mailbox access (`mail.google.com`) and never reads contacts or Drive files.

## Verifying it works

After connecting, ask Jarvis from any messaging channel:

> "Check my unread emails."

You should get a list of subjects and senders. If you do, Gmail is wired correctly. If not, see [troubleshooting.md](./troubleshooting.md).

## Limits and caveats

- The Gmail API is rate-limited per project (~250 quota units / user / second). Tigerpaw doesn't batch aggressively, so a flurry of `assistant_read_emails` calls could hit limits — usually fine for personal use.
- Send rate is 250 messages/day for personal accounts and 2000/day for Workspace. Way more than Jarvis will ever send.
- Attachments are not yet exposed via assistant tools — only text body and metadata.
- Mark-read / archive / label tools are reserved for a future release; the scopes are requested now so an upgrade doesn't require re-consent.
