# Google Service Account setup

Service accounts let Tigerpaw act on behalf of users in a Google Workspace **without per-user OAuth consent**. The trade-off: it requires Workspace admin access and only works for Google Workspace tenants (not personal `@gmail.com` accounts).

Use this when:

- You're a Workspace admin deploying Tigerpaw across many users.
- You want Tigerpaw to send mail or manage calendars from a shared mailbox.
- You need a non-interactive flow — e.g. a daily briefing cron that runs without a person clicking "Allow".

If neither of those applies, stick with [OAuth2 setup](./oauth-setup.md) — it's simpler.

## Prerequisites

- A Google Workspace account (`yourdomain.com`, not `gmail.com`).
- Super-admin access to the [Workspace Admin Console](https://admin.google.com).
- The Google Cloud Console for your Workspace's organization.

## 1. Create the service account

1. Open the [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Pick or create a project.
3. **Create service account**:
   - Name: e.g. `tigerpaw-jarvis`
   - Description: optional
   - Click **Create and Continue**.
4. Skip the optional role grant (Tigerpaw doesn't need a project-level role) and click **Done**.

## 2. Enable the APIs

In the same project go to **APIs & Services → Library** and enable each API the SA will use:

- **Gmail API** — for Gmail
- **Google Calendar API** — for Google Calendar and Google Meet

## 3. Download the JSON key

1. Open the service account → **Keys** tab → **Add key → Create new key → JSON**.
2. A JSON file downloads. Open it in a text editor — the entire content goes into Tigerpaw later.

> Keep this file safe. The `private_key` field is a literal RSA private key; anyone with it can act as the service account.

## 4. Enable Domain-Wide Delegation

This is the step that makes the SA _able to impersonate Workspace users_.

1. In the service account → **Details** → expand **Advanced settings** → check **Enable Google Workspace Domain-wide Delegation**. Save.
2. Note the **Client ID** (a long numeric string) shown after enabling — you'll paste it into the admin console next.

## 5. Authorize scopes in the Admin Console

This is where the most common setup mistake happens. The Workspace admin must explicitly authorize the scopes the SA may use.

1. Open the [Workspace Admin Console](https://admin.google.com).
2. Go to **Security → Access and data control → API controls**.
3. Click **Manage Domain Wide Delegation**.
4. Click **Add new** and fill in:
   - **Client ID**: the numeric ID from step 4 (not the email).
   - **OAuth scopes**: comma-separated list. For full Tigerpaw functionality:

     ```
     https://www.googleapis.com/auth/gmail.readonly,
     https://www.googleapis.com/auth/gmail.send,
     https://www.googleapis.com/auth/gmail.compose,
     https://www.googleapis.com/auth/gmail.modify,
     https://www.googleapis.com/auth/calendar,
     https://www.googleapis.com/auth/calendar.events,
     https://www.googleapis.com/auth/userinfo.email
     ```

   Add only the scopes you actually need (see [scopes-permissions.md](./scopes-permissions.md)).

5. **Authorize**.

> Changes here take ~5 minutes to propagate. If Tigerpaw fails with `unauthorized_client` immediately after this step, wait and retry.

## 6. Connect Tigerpaw

1. Open Tigerpaw → **Integrations** → click **Gmail** (or whichever Google integration).
2. In the auth method picker, select **Service Account**.
3. Paste the **entire JSON file contents** into the JSON box, or use **Paste from clipboard**.
4. **Impersonate email**: enter the Workspace user the SA should act as (e.g. `briefing-bot@yourdomain.com`). The SA mints tokens _as that user_ on each request.
5. Tigerpaw shows the scopes it will request — review them and confirm they're a subset of what step 5 authorized.
6. Click **Connect**.

## How it works under the hood

- Tigerpaw saves the SA private key encrypted in the OS keychain (or encrypted file fallback).
- On each Gmail / Calendar / Meet API call, Tigerpaw signs a fresh JWT with `sub = impersonateEmail`, exchanges it for an access token at Google's token endpoint, and uses the token. There's no persistent refresh token — the JWT _is_ the credential.
- This means revoking is instantaneous: delete the JSON key in the Cloud Console, and every future request fails immediately. There's no token cache to expire.

## Troubleshooting

- **`unauthorized_client`** — the scopes you're requesting aren't in the admin-console allowlist (step 5), or the Client ID there doesn't match the SA. Wait 5 min after changes; double-check Client ID matches the _numeric_ one from the SA details, not the SA email.
- **`access_denied: Account not found`** — the impersonation email is wrong, or that user isn't in your Workspace.
- **`Domain-wide delegation is not enabled`** — re-check step 4; it's easy to miss the checkbox.

For more, see [troubleshooting.md](./troubleshooting.md).
