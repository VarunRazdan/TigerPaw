/**
 * Email API clients — Gmail (Google) and Outlook (Microsoft Graph).
 *
 * Both implement the EmailClient interface so callers don't need to
 * know which provider is connected.
 */

import type { EmailClient, EmailMessage, SendEmailParams, SendEmailResult } from "./types.js";
import { IntegrationApiError } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────

async function checkedFetch(provider: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IntegrationApiError(provider, res.status, text.slice(0, 300));
  }
  return res;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ── Gmail ────────────────────────────────────────────────────────

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailMessageResource = {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType?: string; body?: { data?: string } }[];
  };
  internalDate?: string;
};

function parseGmailMessage(msg: GmailMessageResource, includeBody: boolean): EmailMessage {
  const headers = msg.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  let body: string | undefined;
  if (includeBody) {
    // Try plain text part first, then HTML, then top-level body
    const parts = msg.payload?.parts ?? [];
    const textPart = parts.find((p) => p.mimeType === "text/plain");
    const htmlPart = parts.find((p) => p.mimeType === "text/html");
    const rawB64 = textPart?.body?.data ?? htmlPart?.body?.data ?? msg.payload?.body?.data;
    if (rawB64) {
      body = Buffer.from(rawB64, "base64url").toString("utf-8");
    }
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: header("From"),
    to: header("To")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    cc: header("Cc")
      ? header("Cc")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    subject: header("Subject"),
    snippet: msg.snippet ?? "",
    body,
    date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : "",
    read: !(msg.labelIds ?? []).includes("UNREAD"),
    labels: msg.labelIds,
  };
}

export class GmailClient implements EmailClient {
  constructor(private readonly accessToken: string) {}

  async listMessages(opts?: {
    query?: string;
    maxResults?: number;
    unreadOnly?: boolean;
  }): Promise<EmailMessage[]> {
    const params = new URLSearchParams();
    const parts: string[] = [];
    if (opts?.query) {
      parts.push(opts.query);
    }
    if (opts?.unreadOnly) {
      parts.push("is:unread");
    }
    if (parts.length > 0) {
      params.set("q", parts.join(" "));
    }
    params.set("maxResults", String(opts?.maxResults ?? 20));

    const listRes = await checkedFetch("gmail", `${GMAIL_BASE}/messages?${params}`, {
      headers: authHeaders(this.accessToken),
    });
    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    if (!listData.messages?.length) {
      return [];
    }

    // Fetch each message's metadata (batching would be ideal but adds complexity)
    const messages = await Promise.all(
      listData.messages.slice(0, opts?.maxResults ?? 20).map(async (m) => {
        const msgRes = await checkedFetch(
          "gmail",
          `${GMAIL_BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`,
          { headers: authHeaders(this.accessToken) },
        );
        return parseGmailMessage((await msgRes.json()) as GmailMessageResource, false);
      }),
    );

    return messages;
  }

  async getMessage(id: string): Promise<EmailMessage> {
    const res = await checkedFetch("gmail", `${GMAIL_BASE}/messages/${id}?format=full`, {
      headers: authHeaders(this.accessToken),
    });
    return parseGmailMessage((await res.json()) as GmailMessageResource, true);
  }

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    const lines = [
      `To: ${params.to.join(", ")}`,
      ...(params.cc?.length ? [`Cc: ${params.cc.join(", ")}`] : []),
      ...(params.bcc?.length ? [`Bcc: ${params.bcc.join(", ")}`] : []),
      `Subject: ${params.subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      params.body,
    ];
    const raw = Buffer.from(lines.join("\r\n")).toString("base64url");

    const res = await checkedFetch("gmail", `${GMAIL_BASE}/messages/send`, {
      method: "POST",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const data = (await res.json()) as { id: string; threadId?: string };
    return { id: data.id, threadId: data.threadId };
  }

  async markAsRead(id: string): Promise<void> {
    await checkedFetch("gmail", `${GMAIL_BASE}/messages/${id}/modify`, {
      method: "POST",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });
  }
}

// ── Outlook (Microsoft Graph) ────────────────────────────────────

const GRAPH_MAIL_BASE = "https://graph.microsoft.com/v1.0/me";

type GraphMessage = {
  id: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  ccRecipients?: { emailAddress?: { address?: string } }[];
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  receivedDateTime?: string;
  isRead?: boolean;
  categories?: string[];
};

function parseGraphMessage(msg: GraphMessage, includeBody: boolean): EmailMessage {
  const fromAddr = msg.from?.emailAddress;
  const fromStr = fromAddr?.name
    ? `${fromAddr.name} <${fromAddr.address ?? ""}>`
    : (fromAddr?.address ?? "");

  return {
    id: msg.id,
    threadId: msg.conversationId,
    from: fromStr,
    to: (msg.toRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
    cc:
      (msg.ccRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean) ||
      undefined,
    subject: msg.subject ?? "",
    snippet: msg.bodyPreview ?? "",
    body: includeBody ? msg.body?.content : undefined,
    date: msg.receivedDateTime ?? "",
    read: msg.isRead ?? true,
    labels: msg.categories,
  };
}

export class OutlookMailClient implements EmailClient {
  constructor(private readonly accessToken: string) {}

  async listMessages(opts?: {
    query?: string;
    maxResults?: number;
    unreadOnly?: boolean;
  }): Promise<EmailMessage[]> {
    const params = new URLSearchParams();
    params.set("$top", String(opts?.maxResults ?? 20));
    params.set("$orderby", "receivedDateTime desc");
    params.set(
      "$select",
      "id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,receivedDateTime,isRead,categories",
    );

    const filters: string[] = [];
    if (opts?.unreadOnly) {
      filters.push("isRead eq false");
    }
    if (filters.length > 0) {
      params.set("$filter", filters.join(" and "));
    }
    if (opts?.query) {
      params.set("$search", `"${opts.query}"`);
    }

    const res = await checkedFetch("outlook", `${GRAPH_MAIL_BASE}/messages?${params}`, {
      headers: authHeaders(this.accessToken),
    });
    const data = (await res.json()) as { value: GraphMessage[] };
    return (data.value ?? []).map((m) => parseGraphMessage(m, false));
  }

  async getMessage(id: string): Promise<EmailMessage> {
    const res = await checkedFetch("outlook", `${GRAPH_MAIL_BASE}/messages/${id}`, {
      headers: authHeaders(this.accessToken),
    });
    return parseGraphMessage((await res.json()) as GraphMessage, true);
  }

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    const message = {
      subject: params.subject,
      body: { contentType: "Text", content: params.body },
      toRecipients: params.to.map((addr) => ({ emailAddress: { address: addr } })),
      ...(params.cc?.length
        ? { ccRecipients: params.cc.map((addr) => ({ emailAddress: { address: addr } })) }
        : {}),
      ...(params.bcc?.length
        ? { bccRecipients: params.bcc.map((addr) => ({ emailAddress: { address: addr } })) }
        : {}),
    };

    const res = await checkedFetch("outlook", `${GRAPH_MAIL_BASE}/sendMail`, {
      method: "POST",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    // sendMail returns 202 with no body; create a synthetic ID
    void res;
    return { id: `outlook-${Date.now()}` };
  }

  async markAsRead(id: string): Promise<void> {
    await checkedFetch("outlook", `${GRAPH_MAIL_BASE}/messages/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(this.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
  }
}
