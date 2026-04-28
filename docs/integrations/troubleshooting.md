# Integrations troubleshooting

Common errors and how to fix them. The OAuth callback page links here when something goes wrong.

## OAuth errors

### `redirect_uri_mismatch`

The redirect URI registered in your OAuth app doesn't match the one Tigerpaw is using.

**Fix:**

1. Open Tigerpaw → **Integrations** → click the **Set up** button for your provider (Google, Microsoft, or Zoom).
2. Copy the redirect URI shown in the dialog (use the **Copy** button — typos are the #1 cause of this error).
3. Open the OAuth provider console (Google Cloud Console / Azure Portal / Zoom Marketplace).
4. Edit your OAuth app's **Authorized redirect URIs** list and paste the exact URI.
5. Save, then try connecting again.

Common gotchas:

- Trailing slash matters. `http://127.0.0.1:18789/integrations/oauth2/callback` and `http://127.0.0.1:18789/integrations/oauth2/callback/` are different URIs.
- `localhost` and `127.0.0.1` are different. Always use what Tigerpaw shows you.
- HTTP vs HTTPS matters. If you reverse-proxy Tigerpaw behind HTTPS, register the HTTPS URI.

### `invalid_client`

The Client ID or Secret in Tigerpaw's config doesn't match what's registered with the provider.

**Fix:**

1. In Tigerpaw, click **Set up [Provider] OAuth** and re-enter the credentials.
2. Make sure you copied the **Secret value** (not the Secret ID — for Azure especially these are different fields).
3. If you recently rotated the secret in the provider console, the old one is dead — Tigerpaw won't auto-discover the new one; you must re-paste.

### `access_denied`

You cancelled the consent screen.

**Fix:** click Connect again from the Integrations page and approve the requested permissions.

### `invalid_grant`

The OAuth code expired before Tigerpaw could exchange it. This usually happens when:

- The callback URL was opened more than once (browser back/refresh).
- The exchange took longer than 10 minutes (rare).

**Fix:** click Connect again to start a fresh OAuth flow.

### `invalid_scope`

The OAuth app doesn't have one of the scopes Tigerpaw needs.

**Fix:** open the OAuth provider console and add the missing scopes. The exact list lives in [scopes-permissions.md](./scopes-permissions.md).

For Microsoft: scopes are added under **API permissions → Microsoft Graph → Delegated permissions**. After adding, click **Grant admin consent** if your tenant requires it.

### Popup blocked

You clicked Connect and Tigerpaw immediately showed a "Browser blocked the OAuth popup" error.

**Fix:** allow popups for the Tigerpaw URL in your browser, then click Connect again.

### "OAuth flow timed out"

You started an OAuth flow but didn't complete the consent screen within 5 minutes. The popup is closed automatically.

**Fix:** click Connect again and complete the consent flow promptly.

## Service-account errors

### `unauthorized_client`

The service-account flow rejected because either:

- The scopes you're requesting aren't in your Workspace admin-console allowlist, or
- The Client ID in the admin console doesn't match the service account.

**Fix:**

1. Re-check [Service Account setup](./service-account-setup.md) step 5 — the OAuth scopes field must list every scope Tigerpaw uses.
2. Verify the **Client ID** in the admin console is the _numeric_ ID from the SA details page, not the SA email address.
3. Wait 5 minutes after admin-console changes; propagation isn't instant.

### `access_denied: Account not found`

The impersonation email is wrong, or that user isn't in your Workspace.

**Fix:** in Tigerpaw's Service Account dialog, set Impersonate email to a real Workspace user (e.g. `briefing-bot@yourdomain.com`).

### "Domain-wide delegation is not enabled"

Step 4 of the SA setup was skipped.

**Fix:** Cloud Console → Service account → Details → Advanced settings → check **Enable Google Workspace Domain-wide Delegation** → Save.

### Service-account works at first but fails later

Likely the JSON key was rotated or revoked in the Cloud Console. Tigerpaw mints tokens on demand, so the failure surfaces on the next request.

**Fix:** in the Cloud Console, generate a new JSON key for the same service account and re-paste it into Tigerpaw's Service Account dialog.

## Connection-state errors

### Card shows "Token expired — click to reconnect"

For OAuth2: Tigerpaw refreshes tokens automatically using the refresh token. If you see this message, the refresh token itself was revoked — most often because:

- You revoked Tigerpaw's access in your Google/Microsoft/Zoom account dashboard.
- The OAuth app's **Trust state** changed (Microsoft sometimes invalidates refresh tokens after admin-policy changes).
- 6 months passed without using the integration (some providers expire idle refresh tokens).

**Fix:** click the card to reconnect. Tigerpaw walks you back through the OAuth flow.

### Connected but tools fail with "Insufficient scopes"

The OAuth app has fewer scopes than Tigerpaw expects. Happens when you add a new tool or upgrade Tigerpaw and the older OAuth app didn't request the new scopes at consent time.

**Fix:** disconnect and reconnect from the Integrations page — Tigerpaw will prompt for consent on the up-to-date scope list.

## When all else fails

- Open `~/.tigerpaw/logs/gateway.log` for the full upstream error message — the OAuth callback page truncates for readability but the log has everything.
- Run `tigerpaw doctor` for a quick health check across channels and integrations.
- Open an issue at <https://github.com/varunrazdan/tigerpaw/issues> with the log excerpt and a description of the steps you took.
