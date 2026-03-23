import { gatewayRpc } from "./gateway-rpc";

type ConfigSnapshot = {
  hash?: string;
  [key: string]: unknown;
};

type SaveResult = { ok: true } | { ok: false; error: string; needsAuth: boolean };

/**
 * Writes a config merge-patch directly to tigerpaw.json via the gateway API.
 * Two-step flow: config.get (get baseHash) → config.patch (merge credentials).
 */
export async function saveConfigPatch(
  configPatch: Record<string, unknown>,
  options?: { token?: string },
): Promise<SaveResult> {
  // Step 1: Get current config to obtain baseHash
  const getResult = await gatewayRpc<ConfigSnapshot>("config.get", {}, options);
  if (!getResult.ok) {
    return {
      ok: false,
      error: getResult.error,
      needsAuth: getResult.code === "AUTH_REQUIRED",
    };
  }

  const baseHash = getResult.payload.hash;
  if (!baseHash) {
    return { ok: false, error: "Config hash unavailable", needsAuth: false };
  }

  // Step 2: Patch the config
  const patchResult = await gatewayRpc(
    "config.patch",
    {
      raw: JSON.stringify(configPatch),
      baseHash,
      note: "Credentials added via ConnectDialog",
    },
    options,
  );

  if (!patchResult.ok) {
    return {
      ok: false,
      error: patchResult.error,
      needsAuth: patchResult.code === "AUTH_REQUIRED",
    };
  }

  return { ok: true };
}
