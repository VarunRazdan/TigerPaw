/**
 * Workflow execution types.
 *
 * These types define the runtime shape of workflow nodes and execution results.
 */

export type StoredCredential = {
  id: string;
  name: string;
  type: string; // e.g. "api_key", "oauth2", "basic_auth", "custom"
  fields: Record<string, string>; // encrypted at rest
  createdAt: string;
  updatedAt: string;
};
