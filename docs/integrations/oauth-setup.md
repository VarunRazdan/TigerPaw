# OAuth setup — registering your OAuth app

Tigerpaw connects to Gmail, Calendar, Zoom, etc. via standard OAuth2. Each _OAuth group_ (Google, Microsoft, Zoom) needs **one** OAuth app registered with the provider — that app is reused for every integration in the group. After you set it up once, every Gmail / Calendar / Meet connection in that group goes through it.

This page covers the one-time OAuth-app registration. Per-provider details (scopes, what to enable, etc.) live in the per-integration pages.

## Before you start

You need:

- Tigerpaw running locally so you know the redirect URI. Open Tigerpaw → **Integrations** → click the integration you want → click **Set up OAuth** if Tigerpaw shows that prompt. The dialog displays the exact redirect URI to register; for a default install it's:

  ```
  http://127.0.0.1:18789/integrations/oauth2/callback
  ```

  If your gateway runs on a different port, the URI changes — always copy the one Tigerpaw shows you.

- An account with the OAuth provider (Google, Microsoft, Zoom).

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

## How Tigerpaw stores the credentials

The Client ID and Secret are saved into your Tigerpaw config at `~/.tigerpaw/tigerclaw.json` under `integrations.oauth.<group>`. The user OAuth tokens (refresh + access) are encrypted with the OS keychain (macOS Keychain, Linux Secret Service) where available, with an AES-256-GCM file-encrypted fallback. They never leave your machine.

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

If something goes wrong, see [troubleshooting.md](./troubleshooting.md).
