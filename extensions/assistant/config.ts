export type AssistantConfig = {
  dailyBriefing: {
    enabled: boolean;
    cronExpression: string;
    timezone: string;
    channels: string[];
  };
  taskManagement: {
    enabled: boolean;
    maxTasks: number;
  };
  memoryIntegration: {
    enabled: boolean;
    autoSummarize: boolean;
  };
};

export const ASSISTANT_NAME = "Jarvis";

export function getPersonaGreeting(): string {
  return "Good day.";
}

export function getPersonaSignoff(): string {
  return "— Jarvis";
}

export function getPersonaName(): string {
  return "Jarvis";
}

export const assistantConfigSchema = {
  parse(value: unknown): AssistantConfig {
    const cfg = (
      value && typeof value === "object" && !Array.isArray(value) ? value : {}
    ) as Record<string, unknown>;

    // Daily briefing
    const briefingRaw = (
      cfg.dailyBriefing && typeof cfg.dailyBriefing === "object" ? cfg.dailyBriefing : {}
    ) as Record<string, unknown>;

    const dailyBriefing = {
      enabled: typeof briefingRaw.enabled === "boolean" ? briefingRaw.enabled : true,
      cronExpression:
        typeof briefingRaw.cronExpression === "string" ? briefingRaw.cronExpression : "0 8 * * *",
      timezone:
        typeof briefingRaw.timezone === "string"
          ? briefingRaw.timezone
          : Intl.DateTimeFormat().resolvedOptions().timeZone,
      channels: Array.isArray(briefingRaw.channels)
        ? briefingRaw.channels.filter((c): c is string => typeof c === "string")
        : [],
    };

    // Task management
    const taskRaw = (
      cfg.taskManagement && typeof cfg.taskManagement === "object" ? cfg.taskManagement : {}
    ) as Record<string, unknown>;

    const taskManagement = {
      enabled: typeof taskRaw.enabled === "boolean" ? taskRaw.enabled : true,
      maxTasks:
        typeof taskRaw.maxTasks === "number" && taskRaw.maxTasks > 0 ? taskRaw.maxTasks : 100,
    };

    // Memory integration
    const memRaw = (
      cfg.memoryIntegration && typeof cfg.memoryIntegration === "object"
        ? cfg.memoryIntegration
        : {}
    ) as Record<string, unknown>;

    const memoryIntegration = {
      enabled: typeof memRaw.enabled === "boolean" ? memRaw.enabled : true,
      autoSummarize: typeof memRaw.autoSummarize === "boolean" ? memRaw.autoSummarize : true,
    };

    return { dailyBriefing, taskManagement, memoryIntegration };
  },

  uiHints: {},
};
