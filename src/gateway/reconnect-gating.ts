import {
  ConnectErrorDetailCodes,
  readConnectErrorDetailCode,
} from "./protocol/connect-error-details.js";

export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
};

function resolveGatewayErrorDetailCode(
  error: { details?: unknown } | null | undefined,
): string | null {
  return readConnectErrorDetailCode(error?.details);
}

/**
 * Auth errors that won't resolve without user action — don't auto-reconnect.
 *
 * NOTE: AUTH_TOKEN_MISMATCH is intentionally NOT included here because the
 * browser client supports a bounded one-time retry with a cached device token
 * when the endpoint is trusted. Reconnect suppression for mismatch is handled
 * with client state (after retry budget is exhausted).
 */
export function isNonRecoverableAuthError(error: GatewayErrorInfo | undefined): boolean {
  if (!error) {
    return false;
  }
  const code = resolveGatewayErrorDetailCode(error);
  return (
    code === ConnectErrorDetailCodes.AUTH_TOKEN_MISSING ||
    code === ConnectErrorDetailCodes.AUTH_PASSWORD_MISSING ||
    code === ConnectErrorDetailCodes.AUTH_PASSWORD_MISMATCH ||
    code === ConnectErrorDetailCodes.AUTH_RATE_LIMITED ||
    code === ConnectErrorDetailCodes.PAIRING_REQUIRED ||
    code === ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED ||
    code === ConnectErrorDetailCodes.DEVICE_IDENTITY_REQUIRED
  );
}
