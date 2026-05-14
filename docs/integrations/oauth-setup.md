# OAuth setup — registering your OAuth app

Tigerpaw connects to Gmail, Calendar, Zoom, Jira, etc. via standard OAuth2. Each _OAuth group_ (Google, Microsoft, Zoom, Atlassian) needs **one** OAuth app registered with the provider — that app is reused for every integration in the group. After you set it up once, every Gmail / Calendar / Meet / Jira connection in that group goes through it.

This page covers the one-time OAuth-app registration. Per-provider details (scopes, what to enable, etc.) live in the per-integration pages.

## Before you start

You need:

- Tigerpaw running locally so you know the redirect URI. Open Tigerpaw → **Integrations** → click the integration you want → click **Set up OAuth** if Tigerpaw shows that prompt. The dialog displays the exact redirect URI to register; for a default install it's:

  ```
  http://127.0.0.1:18789/integrations/oauth2/callback
  ```

  If your gateway runs on a different port, the URI changes — always copy the one Tigerpaw shows you.

- An account with the OAuth provider (Google, Microsoft, Zoom, Atlassian).

## Google (Gmail, Google Calendar, Google Meet)

1. Open the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Pick an existing project or create a new one (any name; Tigerpaw doesn't care).
3. Go to **APIs & Services → Library** and enable, depending on what you'll connect:
   - **Gmail API** (for Gmail)
   - **Google Calendar API** (for Google Calendar and Google Meet — Meet uses the Calendar API)
4. Go to **APIs & Services → OAuth consent screen** and configure it. For personal use, **External** + **Testing** is fine; add your own email under **Test users**.
5. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorized redirect URIs: paste the redirect URI from Tigerpaw (the dialog has a Copy button).
6. Click **Create**. Google shows a **Client ID** and **Client Secret** — copy both into Tigerpaw's "Set up Google OAuth" dialog and click **Save**.

You can now connect Gmail, Google Calendar, and Google Meet on the Integrations page without doing this again.

## Microsoft (Outlook Mail, Outlook Calendar, Microsoft Teams)

1. Open the [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) page.
2. Click **New registration**.
   - Name: anything (e.g. "Tigerpaw").
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**, unless your tenant requires otherwise.
   - Redirect URI: select **Web** and paste the URI from Tigerpaw.
3. Click **Register**. On the **Overview** page copy the **Application (client) ID**.
4. Go to **Certificates & secrets → Client secrets → New client secret**. Copy the **Value** (not the Secret ID — those are different fields and people copy the wrong one regularly). Treat this like a password.
5. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add:
   - For Outlook Mail: `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`, `User.Read`, `offline_access`
   - For Outlook Calendar: `Calendars.ReadWrite`, `User.Read`, `offline_access`
   - For Microsoft Teams: `OnlineMeetings.ReadWrite`, `User.Read`, `offline_access`
     You can add all of them at once if you'll use multiple Microsoft integrations.
6. Paste the Client ID and Secret Value into Tigerpaw's "Set up Microsoft OAuth" dialog and click **Save**.

## Zoom

1. Open the [Zoom Marketplace → Develop → Build App](https://marketplace.zoom.us/develop/create) page.
2. Choose **OAuth** app type.
3. Under **Redirect URL for OAuth** paste the URI from Tigerpaw. Add the same URI under **OAuth Allow List**.
4. Under **Scopes**, add `meeting:write`, `meeting:read`, `user:read`.
5. Copy the **Client ID** and **Client Secret** from the App Credentials tab into Tigerpaw's "Set up Zoom OAuth" dialog.

## Atlassian (Jira)

1. Open the [Atlassian Developer Console → My Apps](https://developer.atlassian.com/console/myapps/).
2. Click **Create → OAuth 2.0 integration**. Give it a name (e.g. "Tigerpaw"); accept the terms.
3. Open the new app, then under **Authorization → OAuth 2.0 (3LO) → Configure**:
   - **Callback URL**: paste the redirect URI from Tigerpaw.
   - Save.
4. Under **Permissions** click **Add** next to **Jira API** and grant the scopes:
   - `read:jira-user` (identify the connected account)
   - `read:jira-work` (read issues, projects, comments)
   - `write:jira-work` (create / edit / transition issues, add comments)
   - `offline_access` (refresh tokens — required so Tigerpaw doesn't ask you to re-consent every hour)
5. Distribute the app to your Atlassian site: under **Distribution → Edit** choose **Sharing → Private** (for personal use) and save. If your account doesn't own a Jira site, install the app on a site you administer.
6. Open **Settings** and copy the **Client ID** and **Secret** into Tigerpaw's "Set up Atlassian OAuth" dialog. Click **Save**.

A few Atlassian-specific notes:

- **No PKCE for 3LO.** Atlassian's authorization-code flow doesn't document PKCE support, so Tigerpaw deliberately omits the `code_challenge` parameter for Jira. Connecting still uses your Client Secret, which Tigerpaw stores encrypted.
- **One site per connection (v1).** Atlassian accounts can have multiple Jira sites. Tigerpaw picks the first one returned by `accessible-resources` after consent and shows the site name in the connection label so you can spot a mismatch. To switch sites, disconnect and reconnect (you can choose which site to grant access to in the Atlassian consent screen).
- **Rotating refresh tokens.** Atlassian rotates the refresh token on every refresh — Tigerpaw persists the new value automatically, so there's nothing for you to do.

## How Tigerpaw stores the credentials

The Client ID and Secret are saved into your Tigerpaw config at `~/.tigerpaw/tigerpaw.json` under `integrations.oauth.<group>` (legacy installs may still use `~/.tigerclaw/tigerclaw.json`). The user OAuth tokens (refresh + access) are encrypted with the OS keychain (macOS Keychain, Linux Secret Service) where available, with an AES-256-GCM file-encrypted fallback. They never leave your machine.

If you rotate the Client Secret in the provider console, repeat step 6 (or 4 for Zoom) — Tigerpaw doesn't auto-refresh credentials it hasn't been told about.

## Next

You're set up for the OAuth group. Open Tigerpaw → Integrations → click the specific integration and follow the OAuth consent flow:

- [Gmail](./gmail.md)
- [Outlook Mail](./outlook-mail.md)
- [Google Calendar](./google-calendar.md)
- [Outlook Calendar](./outlook-calendar.md)
- [Google Meet](./google-meet.md)
- [Microsoft Teams](./microsoft-teams.md)
- [Zoom](./zoom.md)
- [Jira](./jira.md)

If something goes wrong, see [troubleshooting.md](./troubleshooting.md).
