import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertOwnership } from "../../gateway/ownership.js";
import { writeJsonAtomic } from "../../infra/json-files.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { withFileLock, type FileLockOptions } from "../../plugin-sdk/file-lock.js";
import type { StrategyDefinition, StrategyExecution } from "./types.js";

const log = createSubsystemLogger("trading/strategies");

const LOCK_OPTIONS: FileLockOptions = {
  retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
  stale: 10_000,
};

function dataDir(): string {
  return process.env.TIGERPAW_DATA_DIR ?? join(process.cwd(), "data");
}

function strategiesPath(): string {
  return join(dataDir(), "strategies.json");
}

function executionsPath(): string {
  return join(dataDir(), "strategy-executions.json");
}

type StrategiesFile = {
  strategies: StrategyDefinition[];
};

type ExecutionsFile = {
  executions: StrategyExecution[];
};

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeJsonAtomic(filePath, data);
}

// -- CRUD -----------------------------------------------------------------

export async function listStrategies(): Promise<StrategyDefinition[]> {
  const file = await readJson<StrategiesFile>(strategiesPath(), {
    strategies: [],
  });
  return file.strategies;
}

export async function getStrategy(id: string): Promise<StrategyDefinition | undefined> {
  const all = await listStrategies();
  return all.find((s) => s.id === id);
}

export async function saveStrategy(
  input: Omit<
    StrategyDefinition,
    "id" | "createdAt" | "updatedAt" | "version" | "totalTrades" | "winRate" | "totalPnlUsd"
  > & { id?: string },
  ownerId?: string,
  ownerLabel?: string,
): Promise<StrategyDefinition> {
  return withFileLock(strategiesPath(), LOCK_OPTIONS, async () => {
    const file = await readJson<StrategiesFile>(strategiesPath(), {
      strategies: [],
    });
    const now = new Date().toISOString();
    const existing = input.id ? file.strategies.find((s) => s.id === input.id) : undefined;

    if (existing) {
      assertOwnership(existing.ownerId, ownerId);
    }

    const strategy: StrategyDefinition = {
      ...input,
      id: existing?.id ?? input.id ?? randomUUID(),
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ownerId: existing?.ownerId ?? ownerId,
      ownerLabel: existing?.ownerLabel ?? ownerLabel,
      totalTrades: existing?.totalTrades ?? 0,
      winRate: existing?.winRate ?? 0,
      totalPnlUsd: existing?.totalPnlUsd ?? 0,
    };

    if (existing) {
      const idx = file.strategies.indexOf(existing);
      file.strategies[idx] = strategy;
    } else {
      file.strategies.push(strategy);
    }

    await writeJson(strategiesPath(), file);
    log.info(`strategy saved: ${strategy.id} "${strategy.name}" v${strategy.version}`);
    return strategy;
  });
}

export async function deleteStrategy(id: string, ownerId?: string): Promise<boolean> {
  return withFileLock(strategiesPath(), LOCK_OPTIONS, async () => {
    const file = await readJson<StrategiesFile>(strategiesPath(), {
      strategies: [],
    });
    const existing = file.strategies.find((s) => s.id === id);
    if (!existing) {
      return false;
    }

    assertOwnership(existing.ownerId, ownerId);

    file.strategies = file.strategies.filter((s) => s.id !== id);
    await writeJson(strategiesPath(), file);
    log.info(`strategy deleted: ${id}`);
    return true;
  });
}

export async function toggleStrategy(
  id: string,
  enabled: boolean,
  ownerId?: string,
): Promise<StrategyDefinition | undefined> {
  return withFileLock(strategiesPath(), LOCK_OPTIONS, async () => {
    const file = await readJson<StrategiesFile>(strategiesPath(), {
      strategies: [],
    });
    const strategy = file.strategies.find((s) => s.id === id);
    if (!strategy) {
      return undefined;
    }

    assertOwnership(strategy.ownerId, ownerId);

    strategy.enabled = enabled;
    strategy.updatedAt = new Date().toISOString();
    await writeJson(strategiesPath(), file);
    log.info(`strategy ${enabled ? "enabled" : "disabled"}: ${id}`);
    return strategy;
  });
}

export async function updateStrategyPerformance(
  id: string,
  update: {
    totalTrades: number;
    winRate: number;
    totalPnlUsd: number;
    lastExecutedAt: string;
  },
): Promise<void> {
  await withFileLock(strategiesPath(), LOCK_OPTIONS, async () => {
    const file = await readJson<StrategiesFile>(strategiesPath(), {
      strategies: [],
    });
    const strategy = file.strategies.find((s) => s.id === id);
    if (!strategy) {
      return;
    }
    Object.assign(strategy, update);
    await writeJson(strategiesPath(), file);
  });
}

// -- Execution history ----------------------------------------------------

export async function listExecutions(strategyId?: string): Promise<StrategyExecution[]> {
  const file = await readJson<ExecutionsFile>(executionsPath(), {
    executions: [],
  });
  if (strategyId) {
    return file.executions.filter((e) => e.strategyId === strategyId);
  }
  return file.executions;
}

export async function recordExecution(exec: StrategyExecution): Promise<void> {
  await withFileLock(executionsPath(), LOCK_OPTIONS, async () => {
    const file = await readJson<ExecutionsFile>(executionsPath(), {
      executions: [],
    });
    const existing = file.executions.findIndex((e) => e.id === exec.id);
    if (existing >= 0) {
      file.executions[existing] = exec;
    } else {
      file.executions.push(exec);
    }
    // Keep last 500 executions
    if (file.executions.length > 500) {
      file.executions = file.executions.slice(-500);
    }
    await writeJson(executionsPath(), file);
  });
}

export async function clearExecutions(strategyId: string): Promise<number> {
  return withFileLock(executionsPath(), LOCK_OPTIONS, async () => {
    const file = await readJson<ExecutionsFile>(executionsPath(), {
      executions: [],
    });
    const before = file.executions.length;
    file.executions = file.executions.filter((e) => e.strategyId !== strategyId);
    const removed = before - file.executions.length;
    await writeJson(executionsPath(), file);
    return removed;
  });
}
