import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("secrets/access");

export type SecretAccessEntry = {
  timestamp: string;
  secretId: string;
  accessor: string;
  operation: "read" | "write" | "delete";
  context?: string;
};

export function logSecretAccess(entry: Omit<SecretAccessEntry, "timestamp">): void {
  const full: SecretAccessEntry = { ...entry, timestamp: new Date().toISOString() };
  try {
    log.info(`secret ${entry.operation}: ${entry.secretId} by ${entry.accessor}`, full);
  } catch {
    // Never let logging errors crash the caller.
  }
}
