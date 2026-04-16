import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../../config/paths.js";

const SLEEP_STATE_FILENAME = "sleep-state.json";

let cachedSleeping = false;
let initialized = false;

function resolveSleepStatePath(): string {
  return path.join(resolveStateDir(), SLEEP_STATE_FILENAME);
}

export function isSleeping(): boolean {
  if (!initialized) {
    try {
      const raw = fs.readFileSync(resolveSleepStatePath(), "utf-8");
      cachedSleeping = (JSON.parse(raw) as { sleeping?: boolean }).sleeping === true;
    } catch {
      cachedSleeping = false;
    }
    initialized = true;
  }
  return cachedSleeping;
}

export function setSleepState(sleeping: boolean, by?: string): void {
  cachedSleeping = sleeping;
  initialized = true;
  const filePath = resolveSleepStatePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const data = { sleeping, since: Date.now(), by: by ?? null };
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
}
