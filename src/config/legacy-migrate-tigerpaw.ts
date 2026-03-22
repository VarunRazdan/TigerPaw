import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("config/legacy-migrate");

const OLD_DIR_NAME = ".openclaw";
const NEW_DIR_NAME = ".tigerpaw";

/**
 * One-time non-destructive migration: copies ~/.openclaw/ → ~/.tigerpaw/ on first run.
 * Only runs when ~/.tigerpaw does not exist but ~/.openclaw does.
 * Original files are preserved — this is a copy, not a move.
 */
export function migrateOpenClawToTigerClaw(env: NodeJS.ProcessEnv = process.env): void {
  const homedir = resolveRequiredHomeDir(env, os.homedir);
  const oldDir = path.join(homedir, OLD_DIR_NAME);
  const newDir = path.join(homedir, NEW_DIR_NAME);

  // Skip if new dir already exists or old dir doesn't.
  if (fs.existsSync(newDir) || !fs.existsSync(oldDir)) {
    return;
  }

  try {
    fs.cpSync(oldDir, newDir, { recursive: true });
    log.info(`migrated ${oldDir} → ${newDir}`);

    // Rename config file if present.
    const oldConfig = path.join(newDir, "openclaw.json");
    const newConfig = path.join(newDir, "tigerpaw.json");
    if (fs.existsSync(oldConfig) && !fs.existsSync(newConfig)) {
      fs.copyFileSync(oldConfig, newConfig);
      log.info("copied openclaw.json → tigerpaw.json in new state dir");
    }
  } catch (err) {
    // Non-fatal: log and continue. Users can manually migrate.
    log.warn(`legacy migration failed (non-fatal): ${String(err)}`);
  }
}
