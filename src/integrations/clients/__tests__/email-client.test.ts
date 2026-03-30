import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GmailClient, OutlookMailClient } from "../email-client.js";

const mockFetch = vi.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

describe("GmailClient", () => {
  let client: GmailClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    client = new GmailClient("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listMessages returns parsed emails", async () => {
    // First call: list messages
    mockFetch.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "msg1" }, { id: "msg2" }] }));
    // Subsequent calls: get each message
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "msg1",
        threadId: "t1",
        snippet: "Hello world",
        labelIds: ["INBOX", "UNREAD"],
        payload: {
          headers: [
            { name: "From", value: "alice@example.com" },
            { name: "To", value: "bob@example.com" },
            { name: "Subject", value: "Test Email" },
          ],
        },
        internalDate: "1711500000000",
      }),
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "msg2",
        snippet: "Another email",
        labelIds: ["INBOX"],
        payload: {
          headers: [
            { name: "From", value: "carol@example.com" },
            { name: "To", value: "bob@example.com" },
            { name: "Subject", value: "Second Email" },
          ],
        },
        internalDate: "1711500100000",
      }),
    );

    const messages = await client.listMessages({ maxResults: 2 });
    expect(messages).toHaveLength(2);
    expect(messages[0].subject).toBe("Test Email");
    expect(messages[0].from).toBe("alice@example.com");
    expect(messages[0].read).toBe(false); // Has UNREAD label
    expect(messages[1].read).toBe(true); // No UNREAD label
  });

  it("listMessages returns empty for no messages", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ messages: [] }));
    const messages = await client.listMessages();
    expect(messages).toHaveLength(0);
  });

  it("getMessage returns full message with body", async () => {
    const bodyContent = Buffer.from("Hello, this is the email body").toString("base64url");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "msg1",
        payload: {
          headers: [
            { name: "From", value: "alice@example.com" },
            { name: "To", value: "bob@example.com" },
            { name: "Subject", value: "Full Email" },
          ],
          parts: [{ mimeType: "text/plain", body: { data: bodyContent } }],
        },
        internalDate: "1711500000000",
      }),
    );

    const msg = await client.getMessage("msg1");
    expect(msg.subject).toBe("Full Email");
    expect(msg.body).toBe("Hello, this is the email body");
  });

  it("sendMessage encodes RFC 2822 format", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "sent1", threadId: "t1" }));

    const result = await client.sendMessage({
      to: ["bob@example.com"],
      subject: "Test Send",
      body: "Hello Bob",
    });

    expect(result.id).toBe("sent1");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/messages/send");
    expect(opts.method).toBe("POST");
  });

  it("markAsRead sends modify request", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    await client.markAsRead("msg1");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/messages/msg1/modify");
    expect(JSON.parse(opts.body as string)).toEqual({ removeLabelIds: ["UNREAD"] });
  });

  it("throws IntegrationApiError on API failure", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(client.listMessages()).rejects.toThrow("[gmail] 401");
  });
});

describe("OutlookMailClient", () => {
  let client: OutlookMailClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    client = new OutlookMailClient("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listMessages returns parsed emails", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: "outlook-1",
            conversationId: "conv1",
            from: { emailAddress: { address: "alice@outlook.com", name: "Alice" } },
            toRecipients: [{ emailAddress: { address: "bob@outlook.com" } }],
            subject: "Outlook Test",
            bodyPreview: "Preview text",
            receivedDateTime: "2024-03-27T10:00:00Z",
            isRead: false,
          },
        ],
      }),
    );

    const messages = await client.listMessages({ unreadOnly: true });
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toBe("Outlook Test");
    expect(messages[0].from).toContain("Alice");
    expect(messages[0].read).toBe(false);
  });

  it("sendMessage calls sendMail endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 202));

    const result = await client.sendMessage({
      to: ["bob@outlook.com"],
      subject: "Test",
      body: "Hello",
    });

    expect(result.id).toContain("outlook-");
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/sendMail");
    const body = JSON.parse(opts.body as string);
    expect(body.message.subject).toBe("Test");
    expect(body.saveToSentItems).toBe(true);
  });

  it("markAsRead patches isRead", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    await client.markAsRead("msg1");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body as string)).toEqual({ isRead: true });
  });
});
