/**
 * Action executors for workflow action nodes.
 *
 * Each executor receives the node config, execution context, and dependencies
 * (gateway RPC, kill switch, logger). Returns output data to merge into context.
 */

import {
  getEmailClient,
  getCalendarClient,
  getMeetingClient,
} from "../integrations/clients/index.js";
import {
  validateTradingNumeric,
  MAX_QUANTITY,
  MIN_QUANTITY,
} from "../trading/numeric-bounds.js";
import type { ExecutionContext } from "./context.js";
import type { ActionDependencies } from "./types.js";

type ActionExecutor = (
  config: Record<string, unknown>,
  ctx: ExecutionContext,
  deps: ActionDependencies,
) => Promise<Record<string, unknown>>;

// ── Send Message ──────────────────────────────────────────────────

const sendMessage: ActionExecutor = async (config, ctx, deps) => {
  const channel = (config.channel as string | undefined) ?? "";
  const to = ctx.resolveTemplate((config.to ?? config.target ?? "") as string);
  const template = (config.template ?? config.message ?? "") as string;
  const message = ctx.resolveTemplate(template);

  if (!message) {
    throw new Error("send_message: message template is empty");
  }

  deps.log(`Sending message via ${channel || "default"}: "${message.slice(0, 80)}..."`);

  const result = await deps.gatewayRpc("send", {
    to,
    message,
    channel: channel || undefined,
    idempotencyKey: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  if (!result.ok) {
    throw new Error(`send_message failed: ${result.error ?? "unknown error"}`);
  }

  return {
    messageSent: true,
    messageId: (result.payload as Record<string, unknown>)?.messageId,
    channel,
  };
};

// ── Call Webhook ──────────────────────────────────────────────────

const callWebhook: ActionExecutor = async (config, ctx, deps) => {
  const url = ctx.resolveTemplate((config.url as string | undefined) ?? "");
  const method = ((config.method as string | undefined) ?? "POST").toUpperCase();
  const headers: Record<string, string> = {};
  const bodyTemplate = (config.body as string | undefined) ?? "";
  const body = bodyTemplate ? ctx.resolveTemplate(bodyTemplate) : undefined;

  if (!url) {
    throw new Error("call_webhook: url is required");
  }

  // Parse custom headers
  if (config.headers && typeof config.headers === "object") {
    for (const [k, v] of Object.entries(config.headers as Record<string, unknown>)) {
      headers[k] = ctx.resolveTemplate(v as string);
    }
  }

  if (!headers["Content-Type"] && body) {
    headers["Content-Type"] = "application/json";
  }

  deps.log(`Calling webhook: ${method} ${url}`);

  const fetchOpts: RequestInit = { method, headers };
  if (body && method !== "GET" && method !== "HEAD") {
    fetchOpts.body = body;
  }

  const response = await fetch(url, fetchOpts);
  const responseText = await response.text();

  let responseData: unknown;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  if (!response.ok) {
    throw new Error(`call_webhook: ${response.status} ${response.statusText}`);
  }

  return {
    webhookStatus: response.status,
    webhookResponse: responseData,
  };
};

// ── Run LLM Task ─────────────────────────────────────────────────

const runLlmTask: ActionExecutor = async (config, ctx, deps) => {
  const promptTemplate = (config.prompt as string | undefined) ?? "";
  const prompt = ctx.resolveTemplate(promptTemplate);
  const model = config.model as string | undefined;

  if (!prompt) {
    throw new Error("run_llm_task: prompt is required");
  }

  deps.log(`Running LLM task: "${prompt.slice(0, 60)}..."`);

  const result = await deps.gatewayRpc("chat.send", {
    message: prompt,
    model: model || undefined,
    sessionKey: `workflow-${Date.now()}`,
  });

  if (!result.ok) {
    throw new Error(`run_llm_task failed: ${result.error ?? "unknown error"}`);
  }

  const payload = result.payload;
  return {
    llmResponse: payload?.response ?? payload?.text ?? "",
    llmModel: payload?.model ?? model ?? "default",
  };
};

// ── Kill Switch ──────────────────────────────────────────────────

const killswitch: ActionExecutor = async (config, _ctx, deps) => {
  const mode = (config.mode as string | undefined) ?? "activate";
  const reason = (config.reason as string | undefined) ?? "Triggered by workflow";
  const switchMode = (config.switchMode as "hard" | "soft") ?? "hard";

  if (mode === "activate") {
    deps.log(`Activating kill switch: ${reason}`);
    await deps.killSwitch.activate(reason, "workflow", switchMode);
    return { killSwitchActive: true, reason };
  } else if (mode === "deactivate") {
    deps.log("Deactivating kill switch");
    await deps.killSwitch.deactivate("workflow");
    return { killSwitchActive: false };
  }

  const status = await deps.killSwitch.check();
  return { killSwitchActive: status.active, reason: status.reason };
};

// ── Trade (submit order intent) ──────────────────────────────────

const trade: ActionExecutor = async (config, ctx, deps) => {
  const extensionId = ctx.resolveTemplate((config.extensionId as string | undefined) ?? "");
  const symbol = ctx.resolveTemplate((config.symbol as string | undefined) ?? "");
  const side = (config.side as string | undefined) ?? "buy";
  const quantity = Number(config.quantity ?? 0);
  const orderType = (config.orderType as string | undefined) ?? "market";

  if (!extensionId || !symbol || quantity <= 0) {
    throw new Error("trade: extensionId, symbol, and quantity > 0 are required");
  }

  // Bounds validation
  validateTradingNumeric("quantity", quantity, MIN_QUANTITY, MAX_QUANTITY);

  deps.log(`Submitting trade: ${side} ${quantity} ${symbol} via ${extensionId}`);

  // Submit through the gateway's trading flow (policy engine evaluation + execution)
  const result = await deps.gatewayRpc("trading.submit", {
    extensionId,
    symbol,
    side,
    quantity,
    orderType,
    source: "workflow",
  });

  if (!result.ok) {
    throw new Error(`trade failed: ${result.error ?? "unknown error"}`);
  }

  const payload = result.payload;
  return {
    tradeSubmitted: true,
    orderId: payload?.orderId,
    outcome: payload?.outcome ?? "submitted",
  };
};

// ── Send Email ────────────────────────────────────────────────────

const sendEmail: ActionExecutor = async (config, ctx, deps) => {
  const to = ctx
    .resolveTemplate((config.to as string | undefined) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = ctx.resolveTemplate((config.subject as string | undefined) ?? "");
  const bodyTemplate = (config.bodyTemplate ?? config.body ?? "") as string;
  const body = ctx.resolveTemplate(bodyTemplate);
  const cc = config.cc
    ? ctx
        .resolveTemplate(config.cc as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  if (!to.length) {
    throw new Error("send_email: at least one recipient is required");
  }
  if (!subject) {
    throw new Error("send_email: subject is required");
  }
  if (!body) {
    throw new Error("send_email: body is required");
  }

  deps.log(`Sending email to ${to.join(", ")}: "${subject}"`);

  const client = await getEmailClient();
  const result = await client.sendMessage({ to, subject, body, cc });

  return { emailSent: true, emailId: result.id, recipients: to };
};

// ── Create Calendar Event ─────────────────────────────────────────

const createCalendarEvent: ActionExecutor = async (config, ctx, deps) => {
  const title = ctx.resolveTemplate((config.title as string | undefined) ?? "");
  const start = ctx.resolveTemplate((config.start as string | undefined) ?? "");
  const end = ctx.resolveTemplate((config.end as string | undefined) ?? "");
  const description = config.description
    ? ctx.resolveTemplate(config.description as string)
    : undefined;
  const attendees = config.attendees
    ? ctx
        .resolveTemplate(config.attendees as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  if (!title) {
    throw new Error("create_calendar_event: title is required");
  }
  if (!start || !end) {
    throw new Error("create_calendar_event: start and end are required");
  }

  deps.log(`Creating calendar event: "${title}"`);

  const client = await getCalendarClient();
  const event = await client.createEvent({
    title,
    start,
    end,
    description,
    attendees,
    addMeetingLink: config.addMeetingLink === true,
  });

  return {
    eventCreated: true,
    eventId: event.id,
    eventTitle: event.title,
    meetingLink: event.meetingLink,
  };
};

// ── Schedule Meeting ──────────────────────────────────────────────

const scheduleMeeting: ActionExecutor = async (config, ctx, deps) => {
  const topic = ctx.resolveTemplate((config.topic as string | undefined) ?? "");
  const startTime = ctx.resolveTemplate((config.startTime as string | undefined) ?? "");
  const duration = Number(config.duration ?? 30);
  const attendees = config.attendees
    ? ctx
        .resolveTemplate(config.attendees as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  if (!topic) {
    throw new Error("schedule_meeting: topic is required");
  }
  if (!startTime) {
    throw new Error("schedule_meeting: startTime is required");
  }

  deps.log(`Scheduling meeting: "${topic}"`);

  const client = await getMeetingClient();
  const meeting = await client.createMeeting({ topic, startTime, duration, attendees });

  return {
    meetingScheduled: true,
    meetingId: meeting.id,
    joinUrl: meeting.joinUrl,
    provider: meeting.provider,
  };
};

// ── Registry ──────────────────────────────────────────────────────

const executors: Record<string, ActionExecutor> = {
  send_message: sendMessage,
  call_webhook: callWebhook,
  run_llm_task: runLlmTask,
  killswitch,
  trade,
  send_email: sendEmail,
  create_calendar_event: createCalendarEvent,
  schedule_meeting: scheduleMeeting,
};

/**
 * Execute an action node. Returns output data to merge into the execution context.
 * Throws on failure — the engine catches and records the error.
 */
export async function executeAction(
  subtype: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
  deps: ActionDependencies,
): Promise<Record<string, unknown>> {
  const executor = executors[subtype];
  if (!executor) {
    throw new Error(`Unknown action subtype: ${subtype}`);
  }
  return executor(config, ctx, deps);
}

/** List all supported action subtypes. */
export function supportedActions(): string[] {
  return Object.keys(executors);
}
