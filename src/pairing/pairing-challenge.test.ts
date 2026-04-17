import { describe, expect, it, vi } from "vitest";
import { issuePairingChallenge } from "./pairing-challenge.js";

describe("issuePairingChallenge", () => {
  it("creates and sends a pairing reply when request is newly created", async () => {
    const sent: string[] = [];

    const result = await issuePairingChallenge({
      channel: "telegram",
      senderId: "123",
      senderIdLine: "Your Telegram user id: 123",
      upsertPairingRequest: async () => ({ code: "ABCD", created: true }),
      sendPairingReply: async (text) => {
        sent.push(text);
      },
    });

    expect(result).toEqual({ created: true, code: "ABCD" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("ABCD");
  });

  it("does not send a reply when request already exists (default)", async () => {
    const sendPairingReply = vi.fn(async () => {});

    const result = await issuePairingChallenge({
      channel: "telegram",
      senderId: "123",
      senderIdLine: "Your Telegram user id: 123",
      upsertPairingRequest: async () => ({ code: "ABCD", created: false }),
      sendPairingReply,
    });

    expect(result).toEqual({ created: false, code: "ABCD" });
    expect(sendPairingReply).not.toHaveBeenCalled();
  });

  it("sends reply on duplicate when replyOnDuplicate is true", async () => {
    const sendPairingReply = vi.fn(async () => {});

    const result = await issuePairingChallenge({
      channel: "whatsapp",
      senderId: "123",
      senderIdLine: "Your WhatsApp phone number: 123",
      upsertPairingRequest: async () => ({ code: "ABCD", created: false }),
      sendPairingReply,
      replyOnDuplicate: true,
    });

    expect(result).toEqual({ created: false, code: "ABCD" });
    expect(sendPairingReply).toHaveBeenCalledTimes(1);
  });

  it("supports custom reply text builder", async () => {
    const sent: string[] = [];

    await issuePairingChallenge({
      channel: "line",
      senderId: "u1",
      senderIdLine: "Your line id: u1",
      upsertPairingRequest: async () => ({ code: "ZXCV", created: true }),
      buildReplyText: ({ code }) => `custom ${code}`,
      sendPairingReply: async (text) => {
        sent.push(text);
      },
    });

    expect(sent).toEqual(["custom ZXCV"]);
  });

  it("calls onCreated and forwards meta to upsert", async () => {
    const onCreated = vi.fn();
    const upsert = vi.fn(async () => ({ code: "1111", created: true }));

    await issuePairingChallenge({
      channel: "discord",
      senderId: "42",
      senderIdLine: "Your Discord user id: 42",
      meta: { name: "alice" },
      upsertPairingRequest: upsert,
      onCreated,
      sendPairingReply: async () => {},
    });

    expect(upsert).toHaveBeenCalledWith({ id: "42", meta: { name: "alice" } });
    expect(onCreated).toHaveBeenCalledWith({ code: "1111" });
  });

  it("captures reply errors through onReplyError", async () => {
    const onReplyError = vi.fn();

    const result = await issuePairingChallenge({
      channel: "signal",
      senderId: "+1555",
      senderIdLine: "Your Signal sender id: +1555",
      upsertPairingRequest: async () => ({ code: "9999", created: true }),
      sendPairingReply: async () => {
        throw new Error("send failed");
      },
      onReplyError,
    });

    expect(result).toEqual({ created: true, code: "9999" });
    expect(onReplyError).toHaveBeenCalledTimes(1);
  });

  it("calls sendOwnerNotification when provided and request is created", async () => {
    const sendOwnerNotification = vi.fn(async () => {});

    await issuePairingChallenge({
      channel: "whatsapp",
      senderId: "+1555",
      senderIdLine: "Your WhatsApp phone number: +1555",
      upsertPairingRequest: async () => ({ code: "OWNERTEST", created: true }),
      sendPairingReply: async () => {},
      sendOwnerNotification,
    });

    expect(sendOwnerNotification).toHaveBeenCalledTimes(1);
    expect(sendOwnerNotification).toHaveBeenCalledWith({
      code: "OWNERTEST",
      senderIdLine: "Your WhatsApp phone number: +1555",
    });
  });

  it("does not call sendOwnerNotification when created=false", async () => {
    const sendOwnerNotification = vi.fn(async () => {});

    await issuePairingChallenge({
      channel: "whatsapp",
      senderId: "+1555",
      senderIdLine: "Your WhatsApp phone number: +1555",
      upsertPairingRequest: async () => ({ code: "OWNERTEST", created: false }),
      sendPairingReply: async () => {},
      sendOwnerNotification,
    });

    expect(sendOwnerNotification).not.toHaveBeenCalled();
  });

  it("captures sendOwnerNotification errors via onReplyError", async () => {
    const onReplyError = vi.fn();

    await issuePairingChallenge({
      channel: "whatsapp",
      senderId: "+1555",
      senderIdLine: "Your WhatsApp phone number: +1555",
      upsertPairingRequest: async () => ({ code: "FAIL1234", created: true }),
      sendPairingReply: async () => {},
      sendOwnerNotification: async () => {
        throw new Error("owner notification failed");
      },
      onReplyError,
    });

    expect(onReplyError).toHaveBeenCalledTimes(1);
  });
});
