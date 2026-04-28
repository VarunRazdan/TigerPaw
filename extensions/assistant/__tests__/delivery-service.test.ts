/**
 * Tests for the Jarvis delivery service.
 *
 * The service polls `~/.tigerpaw/assistant/reminders.jsonl` and dispatches
 * due reminders via `sendMessage`. Tests use a temp HOME so the service
 * writes into an isolated directory and never touches the user's real data.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// -- Mocks ------------------------------------------------------------------

vi.mock("../../../src/config/config.js", () => ({
  loadConfig: () => ({}),
}));

const mockSendMessage = vi.fn();
vi.mock("../../../src/infra/outbound/message.js", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

// -- Helpers ----------------------------------------------------------------

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

type Reminder = {
  id: string;
  text: string;
  triggerAt: string;
  recurring?: string;
  active: boolean;
  created: string;
  channel?: string;
  to?: string;
  deliveredAt?: string;
  deliveredOn?: string;
};

let tempHome: string;
let assistantDir: string;
let remindersFile: string;

function writeReminders(reminders: Reminder[]): void {
  const content =
    reminders.map((r) => JSON.stringify(r)).join("\n") + (reminders.length > 0 ? "\n" : "");
  writeFileSync(remindersFile, content, "utf-8");
}

function readReminders(): Reminder[] {
  const content = readFileSync(remindersFile, "utf-8").trim();
  if (!content) {
    return [];
  }
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Reminder);
}

beforeEach(() => {
  vi.clearAllMocks();
  tempHome = mkdtempSync(join(tmpdir(), "jarvis-delivery-test-"));
  assistantDir = join(tempHome, ".tigerpaw", "assistant");
  mkdirSync(assistantDir, { recursive: true });
  remindersFile = join(assistantDir, "reminders.jsonl");
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
});

afterEach(() => {
  delete process.env.HOME;
  delete process.env.USERPROFILE;
});

// -- parseChannelTarget -----------------------------------------------------

describe("parseChannelTarget", () => {
  it("parses channel:to strings", async () => {
    const { parseChannelTarget } = await import("../delivery-service.js");
    expect(parseChannelTarget("whatsapp:+15551234")).toEqual({
      channel: "whatsapp",
      to: "+15551234",
    });
  });

  it("parses channel:to:accountId:threadId strings", async () => {
    const { parseChannelTarget } = await import("../delivery-service.js");
    expect(parseChannelTarget("telegram:12345:acct1:thread9")).toEqual({
      channel: "telegram",
      to: "12345",
      accountId: "acct1",
      threadId: "thread9",
    });
  });

  it("parses object form with optional fields", async () => {
    const { parseChannelTarget } = await import("../delivery-service.js");
    expect(parseChannelTarget({ channel: "slack", to: "U123", accountId: "team1" })).toEqual({
      channel: "slack",
      to: "U123",
      accountId: "team1",
    });
  });

  it("rejects malformed entries", async () => {
    const { parseChannelTarget } = await import("../delivery-service.js");
    expect(parseChannelTarget("")).toBeNull();
    expect(parseChannelTarget("onlychannel")).toBeNull();
    expect(parseChannelTarget(":")).toBeNull();
    expect(parseChannelTarget({ channel: "whatsapp" })).toBeNull();
    expect(parseChannelTarget(null)).toBeNull();
    expect(parseChannelTarget(42)).toBeNull();
  });
});

// -- deliverToChannels ------------------------------------------------------

describe("deliverToChannels", () => {
  it("delivers to each parsed channel target", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    const { deliverToChannels } = await import("../delivery-service.js");
    const log = makeLogger();
    const result = await deliverToChannels({
      text: "hello",
      channels: ["whatsapp:+15551234", "telegram:555"],
      log,
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ delivered: 2, attempted: 2 });
  });

  it("explicitTarget overrides the channels list", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    const { deliverToChannels } = await import("../delivery-service.js");
    const log = makeLogger();
    const result = await deliverToChannels({
      text: "hello",
      channels: ["whatsapp:+15551234", "telegram:555"],
      log,
      explicitTarget: { channel: "discord", to: "ch-42" },
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "discord", to: "ch-42", content: "hello" }),
    );
    expect(result).toEqual({ delivered: 1, attempted: 1 });
  });

  it("continues past per-target sendMessage errors", async () => {
    mockSendMessage
      .mockRejectedValueOnce(new Error("channel down"))
      .mockResolvedValueOnce({ via: "direct" });
    const { deliverToChannels } = await import("../delivery-service.js");
    const log = makeLogger();
    const result = await deliverToChannels({
      text: "hello",
      channels: ["whatsapp:+1", "telegram:2"],
      log,
    });
    expect(result).toEqual({ delivered: 1, attempted: 2 });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("logs and skips invalid entries", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    const { deliverToChannels } = await import("../delivery-service.js");
    const log = makeLogger();
    const result = await deliverToChannels({
      text: "hello",
      channels: ["not-valid", "whatsapp:+1"],
      log,
    });
    expect(result).toEqual({ delivered: 1, attempted: 1 });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("no-ops when the target list is empty", async () => {
    const { deliverToChannels } = await import("../delivery-service.js");
    const log = makeLogger();
    const result = await deliverToChannels({
      text: "hello",
      channels: [],
      log,
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, attempted: 0 });
  });
});

// -- pollRemindersOnce ------------------------------------------------------

describe("pollRemindersOnce", () => {
  it("dispatches a due reminder and stamps deliveredAt", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "check BTC",
        triggerAt: "2026-01-01T00:00:00.000Z",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    const now = new Date("2026-01-01T00:00:30.000Z").getTime();
    await pollRemindersOnce({
      log: makeLogger(),
      now,
      briefingChannels: ["whatsapp:+15551234"],
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const updated = readReminders();
    expect(updated[0].deliveredAt).toBe(new Date(now).toISOString());
    expect(updated[0].deliveredOn).toBe("whatsapp");
  });

  it("second poll does not re-dispatch", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "check BTC",
        triggerAt: "2026-01-01T00:00:00.000Z",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    const now = new Date("2026-01-01T00:00:30.000Z").getTime();
    await pollRemindersOnce({
      log: makeLogger(),
      now,
      briefingChannels: ["whatsapp:+15551234"],
    });
    await pollRemindersOnce({
      log: makeLogger(),
      now: now + 1_000,
      briefingChannels: ["whatsapp:+15551234"],
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("recurring reminder advances triggerAt and clears deliveredAt", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "hourly check",
        triggerAt: "2026-01-01T00:00:00.000Z",
        recurring: "0 * * * *",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    const firstNow = new Date("2026-01-01T00:00:30.000Z").getTime();
    await pollRemindersOnce({
      log: makeLogger(),
      now: firstNow,
      briefingChannels: ["whatsapp:+15551234"],
    });
    // After first poll, reminder is marked delivered.
    const afterFirst = readReminders();
    expect(afterFirst[0].deliveredAt).toBeDefined();
    // On the next poll, the recurring step advances triggerAt past `firstNow`
    // and clears deliveredAt so the reminder can fire again later.
    const secondNow = firstNow + 1_000;
    await pollRemindersOnce({
      log: makeLogger(),
      now: secondNow,
      briefingChannels: ["whatsapp:+15551234"],
    });
    const afterSecond = readReminders();
    expect(afterSecond[0].deliveredAt).toBeUndefined();
    expect(new Date(afterSecond[0].triggerAt).getTime()).toBeGreaterThan(secondNow);
  });

  it("leaves deliveredAt null when sendMessage throws (retries next tick)", async () => {
    mockSendMessage.mockRejectedValue(new Error("channel down"));
    writeReminders([
      {
        id: "r1",
        text: "check BTC",
        triggerAt: "2026-01-01T00:00:00.000Z",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    const now = new Date("2026-01-01T00:00:30.000Z").getTime();
    await pollRemindersOnce({
      log: makeLogger(),
      now,
      briefingChannels: ["whatsapp:+15551234"],
    });
    const updated = readReminders();
    expect(updated[0].deliveredAt).toBeUndefined();
  });

  it("reminder.channel+to overrides briefing channels (when allowlisted)", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "check BTC",
        triggerAt: "2026-01-01T00:00:00.000Z",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
        channel: "telegram",
        to: "98765",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    const now = new Date("2026-01-01T00:00:30.000Z").getTime();
    await pollRemindersOnce({
      log: makeLogger(),
      now,
      // telegram:98765 must be in the briefingChannels allowlist for the
      // explicit target to be honored — defense-in-depth against prompt-
      // injection-driven exfiltration.
      briefingChannels: ["whatsapp:+15551234", "telegram:98765"],
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", to: "98765" }),
    );
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const updated = readReminders();
    expect(updated[0].deliveredOn).toBe("telegram");
  });

  it("rejects reminder explicit target not in briefing channel allowlist (exfil defense)", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "<sensitive context>",
        triggerAt: "2026-01-01T00:00:00.000Z",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
        channel: "whatsapp",
        to: "+1ATTACKER",
      },
    ]);
    const log = makeLogger();
    const { pollRemindersOnce } = await import("../delivery-service.js");
    await pollRemindersOnce({
      log,
      now: new Date("2026-01-01T00:00:30.000Z").getTime(),
      briefingChannels: ["whatsapp:+15551234"],
    });
    // Explicit target was not allowlisted → fell back to the legitimate
    // briefingChannels target instead of being delivered to the attacker.
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", to: "+15551234" }),
    );
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("skips inactive reminders", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "cancelled",
        triggerAt: "2026-01-01T00:00:00.000Z",
        active: false,
        created: "2025-12-31T00:00:00.000Z",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    await pollRemindersOnce({
      log: makeLogger(),
      now: new Date("2026-01-01T00:00:30.000Z").getTime(),
      briefingChannels: ["whatsapp:+15551234"],
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("skips future reminders", async () => {
    mockSendMessage.mockResolvedValue({ via: "direct" });
    writeReminders([
      {
        id: "r1",
        text: "not yet",
        triggerAt: "2026-06-01T00:00:00.000Z",
        active: true,
        created: "2025-12-31T00:00:00.000Z",
      },
    ]);
    const { pollRemindersOnce } = await import("../delivery-service.js");
    await pollRemindersOnce({
      log: makeLogger(),
      now: new Date("2026-01-01T00:00:30.000Z").getTime(),
      briefingChannels: ["whatsapp:+15551234"],
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("no-ops when the reminders file is missing or empty", async () => {
    const { pollRemindersOnce } = await import("../delivery-service.js");
    await pollRemindersOnce({
      log: makeLogger(),
      now: Date.now(),
      briefingChannels: ["whatsapp:+15551234"],
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
