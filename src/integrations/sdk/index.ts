/**
 * Integration SDK — public API.
 *
 * Import this module to access the SDK's types, registry, bridges, and utilities.
 */

export type {
  AuthConfig,
  AuthContext,
  AuthType,
  ApiKeyAuthConfig,
  BasicAuthConfig,
  BearerTokenAuthConfig,
  IntegrationActionDef,
  IntegrationDefinition,
  IntegrationTriggerDef,
  JsonSchema,
  JsonSchemaProperty,
  NoAuthConfig,
  OAuth2AuthConfig,
} from "./types.js";

export {
  clearRegistry,
  getAction,
  getIntegration,
  getTrigger,
  listIntegrations,
  registerIntegration,
} from "./registry.js";

export { validateInput, validateIntegrationDefinition, validateJsonSchema } from "./validation.js";

export { createAuthContext } from "./auth-bridge.js";
export { createSdkActionExecutor } from "./action-bridge.js";
export { registerSdkTrigger } from "./trigger-bridge.js";
export { jsonSchemaToConfigFields } from "./ui-schema.js";
