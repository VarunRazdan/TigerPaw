/**
 * Gateway RPC handlers for the integrations subsystem.
 *
 * Provides methods for listing providers, managing OAuth connections,
 * and testing integration health.
 */

import { getIntegrationService } from "../../integrations/index.js";
import type { IntegrationProviderId } from "../../integrations/types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const integrationsHandlers: GatewayRequestHandlers = {
  // ── Provider listing ─────────────────────────────────────────

  "integrations.providers": ({ respond }) => {
    const service = getIntegrationService();
    const providers = service.listProviders();
    respond(true, { providers }, undefined);
  },

  // ── Connection management ────────────────────────────────────

  "integrations.connections": ({ respond }) => {
    try {
      const service = getIntegrationService();
      const connections = service.listConnections();
      respond(true, { connections }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  "integrations.connection.get": ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }

    const service = getIntegrationService();
    const connection = service.getConnection(id);
    if (!connection) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Connection not found: ${id}`),
      );
      return;
    }

    respond(true, { connection }, undefined);
  },

  // ── OAuth2 flow ──────────────────────────────────────────────

  "integrations.oauth2.start": ({ params, respond }) => {
    const providerId = params.providerId as IntegrationProviderId | undefined;
    if (!providerId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "providerId is required"));
      return;
    }

    const service = getIntegrationService();
    const result = service.startOAuth(providerId);
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error));
      return;
    }

    respond(true, { authUrl: result.authUrl, state: result.state }, undefined);
  },

  "integrations.oauth2.complete": async ({ params, respond }) => {
    const state = params.state as string | undefined;
    const code = params.code as string | undefined;
    if (!state || !code) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "state and code are required"),
      );
      return;
    }

    try {
      const service = getIntegrationService();
      const result = await service.completeOAuth(state, code);
      if ("error" in result) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "OAuth failed"),
        );
        return;
      }

      respond(true, { connection: result }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // ── Disconnect ───────────────────────────────────────────────

  "integrations.disconnect": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }

    const service = getIntegrationService();
    const removed = await service.disconnect(id);
    respond(true, { removed }, undefined);
  },

  // ── Health check ─────────────────────────────────────────────

  "integrations.test": async ({ params, respond }) => {
    const id = params.id as string | undefined;
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }

    try {
      const service = getIntegrationService();
      const result = await service.testConnection(id);
      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
      );
    }
  },
};
