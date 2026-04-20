import { describe, expect, it } from "vitest";
import {
  readAllowFromStoreMock,
  sendMessageMock,
  setAccessControlTestConfig,
  setupAccessControlTestHarness,
  upsertPairingRequestMock,
} from "./access-control.test-harness.js";

setupAccessControlTestHarness();

const { checkInboundAccessControl } = await import("./access-control.js");

async function checkUnauthorizedWorkDmSender() {
  return checkInboundAccessControl({
    accountId: "work",
    from: "+15550001111",
    selfE164: "+15550009999",
    senderE164: "+15550001111",
    group: false,
    pushName: "Stranger",
    isFromMe: false,
    sock: { sendMessage: sendMessageMock },
    remoteJid: "15550001111@s.whatsapp.net",
  });
}

function expectSilentlyBlocked(result: { allowed: boolean }) {
  expect(result.allowed).toBe(false);
  expect(upsertPairingRequestMock).not.toHaveBeenCalled();
  expect(sendMessageMock).not.toHaveBeenCalled();
}

describe("checkInboundAccessControl pairing grace", () => {
  async function runPairingGraceCase(messageTimestampMs: number) {
    const connectedAtMs = 1_000_000;
    return await checkInboundAccessControl({
      accountId: "default",
      from: "+15550001111",
      selfE164: "+15550009999",
      senderE164: "+15550001111",
      group: false,
      pushName: "Sam",
      isFromMe: false,
      messageTimestampMs,
      connectedAtMs,
      pairingGraceMs: 30_000,
      sock: { sendMessage: sendMessageMock },
      remoteJid: "15550001111@s.whatsapp.net",
    });
  }

  it("suppresses pairing replies for historical DMs on connect", async () => {
    const result = await runPairingGraceCase(1_000_000 - 31_000);

    expect(result.allowed).toBe(false);
    expect(upsertPairingRequestMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("sends pairing replies for live DMs", async () => {
    const result = await runPairingGraceCase(1_000_000 - 10_000);

    expect(result.allowed).toBe(false);
    expect(upsertPairingRequestMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalled();
  });
});

describe("checkInboundAccessControl owner notification", () => {
  it("sends friendly message to sender and notification to owner when selfJid provided", async () => {
    const result = await checkInboundAccessControl({
      accountId: "default",
      from: "+15550001111",
      selfE164: "+15550009999",
      senderE164: "+15550001111",
      group: false,
      pushName: "Alice",
      isFromMe: false,
      sock: { sendMessage: sendMessageMock },
      remoteJid: "15550001111@s.whatsapp.net",
      selfJid: "15550009999:12@s.whatsapp.net",
    });

    expect(result.allowed).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    // First call: friendly reply to sender (no pairing code, with Tigerpaw prefix)
    const senderCall = sendMessageMock.mock.calls[0] as [string, { text: string }];
    expect(senderCall[0]).toBe("15550001111@s.whatsapp.net");
    expect(senderCall[1].text).toMatch(/^Tigerpaw:/);
    expect(senderCall[1].text).toContain("not set up to chat");
    expect(senderCall[1].text).not.toContain("Pairing code");
    // Second call: owner notification to self (device suffix stripped, with pairing code)
    const ownerCall = sendMessageMock.mock.calls[1] as [string, { text: string }];
    expect(ownerCall[0]).toBe("15550009999@s.whatsapp.net");
    expect(ownerCall[1].text).toContain("Pairing code:");
    expect(ownerCall[1].text).toContain("Alice");
    expect(ownerCall[1].text).toContain("pairing approve");
  });

  it("sends only friendly message when selfJid is null", async () => {
    const result = await checkInboundAccessControl({
      accountId: "default",
      from: "+15550001111",
      selfE164: "+15550009999",
      senderE164: "+15550001111",
      group: false,
      pushName: "Bob",
      isFromMe: false,
      sock: { sendMessage: sendMessageMock },
      remoteJid: "15550001111@s.whatsapp.net",
      selfJid: null,
    });

    expect(result.allowed).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const senderCall = sendMessageMock.mock.calls[0] as [string, { text: string }];
    expect(senderCall[1].text).toContain("not set up to chat");
  });
});

describe("WhatsApp dmPolicy precedence", () => {
  it("uses account-level dmPolicy instead of channel-level (#8736)", async () => {
    // Channel-level says "pairing" but the account-level says "allowlist".
    // The account-level override should take precedence, so an unauthorized
    // sender should be blocked silently (no pairing reply).
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          dmPolicy: "pairing",
          accounts: {
            work: {
              dmPolicy: "allowlist",
              allowFrom: ["+15559999999"],
            },
          },
        },
      },
    });

    const result = await checkUnauthorizedWorkDmSender();
    expectSilentlyBlocked(result);
  });

  it("inherits channel-level dmPolicy when account-level dmPolicy is unset", async () => {
    // Account has allowFrom set, but no dmPolicy override. Should inherit the channel default.
    // With dmPolicy=allowlist, unauthorized senders are silently blocked.
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          dmPolicy: "allowlist",
          accounts: {
            work: {
              allowFrom: ["+15559999999"],
            },
          },
        },
      },
    });

    const result = await checkUnauthorizedWorkDmSender();
    expectSilentlyBlocked(result);
  });

  it("does not merge persisted pairing approvals in allowlist mode", async () => {
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          dmPolicy: "allowlist",
          accounts: {
            work: {
              allowFrom: ["+15559999999"],
            },
          },
        },
      },
    });
    readAllowFromStoreMock.mockResolvedValue(["+15550001111"]);

    const result = await checkUnauthorizedWorkDmSender();

    expectSilentlyBlocked(result);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });

  it("always allows same-phone DMs even when allowFrom is restrictive", async () => {
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          dmPolicy: "pairing",
          allowFrom: ["+15550001111"],
        },
      },
    });

    const result = await checkInboundAccessControl({
      accountId: "default",
      from: "+15550009999",
      selfE164: "+15550009999",
      senderE164: "+15550009999",
      group: false,
      pushName: "Owner",
      isFromMe: false,
      sock: { sendMessage: sendMessageMock },
      remoteJid: "15550009999@s.whatsapp.net",
    });

    expect(result.allowed).toBe(true);
    expect(upsertPairingRequestMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe("WhatsApp groupPolicy with group JIDs in groupAllowFrom", () => {
  const ALLOWED_GROUP = "120363012345@g.us";
  const OTHER_GROUP = "120363099999@g.us";

  it("allows a group message when the group JID is in groupAllowFrom", async () => {
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          groupPolicy: "allowlist",
          groupAllowFrom: [ALLOWED_GROUP],
        },
      },
    });
    const result = await checkInboundAccessControl({
      accountId: "default",
      from: ALLOWED_GROUP,
      selfE164: "+15550009999",
      senderE164: "+15558887777",
      group: true,
      isFromMe: false,
      sock: { sendMessage: sendMessageMock },
      remoteJid: ALLOWED_GROUP,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks a group message when the group JID is not listed", async () => {
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          groupPolicy: "allowlist",
          groupAllowFrom: [ALLOWED_GROUP],
        },
      },
    });
    const result = await checkInboundAccessControl({
      accountId: "default",
      from: OTHER_GROUP,
      selfE164: "+15550009999",
      senderE164: "+15558887777",
      group: true,
      isFromMe: false,
      sock: { sendMessage: sendMessageMock },
      remoteJid: OTHER_GROUP,
    });
    expect(result.allowed).toBe(false);
  });

  it("still allows a known sender even when the group JID is not listed", async () => {
    setAccessControlTestConfig({
      channels: {
        whatsapp: {
          groupPolicy: "allowlist",
          groupAllowFrom: ["+15558887777"],
        },
      },
    });
    const result = await checkInboundAccessControl({
      accountId: "default",
      from: OTHER_GROUP,
      selfE164: "+15550009999",
      senderE164: "+15558887777",
      group: true,
      isFromMe: false,
      sock: { sendMessage: sendMessageMock },
      remoteJid: OTHER_GROUP,
    });
    expect(result.allowed).toBe(true);
  });
});
