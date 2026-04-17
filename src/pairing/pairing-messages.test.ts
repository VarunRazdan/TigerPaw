import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureEnv } from "../test-utils/env.js";
import {
  buildOwnerPairingNotification,
  buildPairingReply,
  buildSenderFriendlyReply,
} from "./pairing-messages.js";

describe("buildPairingReply", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    envSnapshot = captureEnv(["OPENCLAW_PROFILE"]);
    process.env.OPENCLAW_PROFILE = "isolated";
  });

  afterEach(() => {
    envSnapshot.restore();
  });

  const cases = [
    {
      channel: "telegram",
      idLine: "Your Telegram user id: 42",
      code: "QRS678",
    },
    {
      channel: "discord",
      idLine: "Your Discord user id: 1",
      code: "ABC123",
    },
    {
      channel: "slack",
      idLine: "Your Slack user id: U1",
      code: "DEF456",
    },
    {
      channel: "signal",
      idLine: "Your Signal number: +15550001111",
      code: "GHI789",
    },
    {
      channel: "imessage",
      idLine: "Your iMessage sender id: +15550002222",
      code: "JKL012",
    },
    {
      channel: "whatsapp",
      idLine: "Your WhatsApp phone number: +15550003333",
      code: "MNO345",
    },
  ] as const;

  for (const testCase of cases) {
    it(`formats pairing reply for ${testCase.channel}`, () => {
      const text = buildPairingReply(testCase);
      expect(text).toContain(testCase.idLine);
      expect(text).toContain(`Pairing code: ${testCase.code}`);
      // CLI commands should respect OPENCLAW_PROFILE when set (most tests run with isolated profile)
      const commandRe = new RegExp(
        `(?:tigerpaw|openclaw) --profile isolated pairing approve ${testCase.channel} ${testCase.code}`,
      );
      expect(text).toMatch(commandRe);
    });
  }
});

describe("buildSenderFriendlyReply", () => {
  it("returns a friendly message with Tigerpaw prefix", () => {
    const text = buildSenderFriendlyReply();
    expect(text).toMatch(/^Tigerpaw:/);
    expect(text).toContain("not set up to chat");
    expect(text).toContain("owner has been notified");
  });

  it("does not contain a pairing code", () => {
    const text = buildSenderFriendlyReply();
    expect(text).not.toContain("Pairing code");
    expect(text).not.toContain("pairing approve");
  });
});

describe("buildOwnerPairingNotification", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    envSnapshot = captureEnv(["OPENCLAW_PROFILE"]);
    process.env.OPENCLAW_PROFILE = "isolated";
  });

  afterEach(() => {
    envSnapshot.restore();
  });

  it("includes sender name and phone", () => {
    const text = buildOwnerPairingNotification({
      channel: "whatsapp",
      senderName: "John",
      senderId: "+15550001111",
      code: "ABCD1234",
    });
    expect(text).toContain("John");
    expect(text).toContain("+15550001111");
  });

  it("includes pairing code", () => {
    const text = buildOwnerPairingNotification({
      channel: "whatsapp",
      senderId: "+15550001111",
      code: "XYZW9876",
    });
    expect(text).toContain("Pairing code: XYZW9876");
  });

  it("includes CLI approval command", () => {
    const text = buildOwnerPairingNotification({
      channel: "whatsapp",
      senderId: "+15550001111",
      code: "TEST1234",
    });
    expect(text).toMatch(/pairing approve whatsapp TEST1234/);
  });

  it("handles missing sender name", () => {
    const text = buildOwnerPairingNotification({
      channel: "whatsapp",
      senderId: "+15550001111",
      code: "NONAME00",
    });
    expect(text).toContain("+15550001111");
    expect(text).not.toContain("undefined");
  });
});
