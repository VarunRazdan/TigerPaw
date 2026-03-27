import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const SESSIONS_DIR = join(homedir(), ".tigerpaw", "sessions");

type RecentMessage = {
  id: string;
  channel: string;
  author: string;
  text: string;
  timestamp: string;
  type: "message" | "approval" | "alert";
  read: boolean;
};

/**
 * Scan session transcript files for recent messages.
 * This is a best-effort read — transcripts may not exist or may be empty.
 */
function readRecentMessages(limit: number): RecentMessage[] {
  if (!existsSync(SESSIONS_DIR)) {
    return [];
  }

  const messages: RecentMessage[] = [];
  try {
    const sessionDirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const sessionId of sessionDirs) {
      const transcriptPath = join(SESSIONS_DIR, sessionId, "transcript.jsonl");
      if (!existsSync(transcriptPath)) {
        continue;
      }

      try {
        const content = readFileSync(transcriptPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        // Read from the end for recent messages
        const recentLines = lines.slice(-50);

        for (const line of recentLines) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === "message" && entry.role === "user" && entry.text) {
              messages.push({
                id: entry.id ?? `${sessionId}-${messages.length}`,
                channel: entry.channel ?? sessionId.split("-")[0] ?? "unknown",
                author: entry.sender ?? entry.author ?? "User",
                text:
                  typeof entry.text === "string" ? entry.text.slice(0, 500) : String(entry.text),
                timestamp: entry.timestamp ?? entry.ts ?? new Date().toISOString(),
                type: entry.approvalRequired ? "approval" : "message",
                read: false,
              });
            }
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip unreadable transcripts
      }
    }
  } catch {
    // Sessions dir not readable
  }

  // Sort by timestamp descending, take limit
  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return messages.slice(0, limit);
}

export const messagesHandlers: GatewayRequestHandlers = {
  "messages.recent": async ({ params, respond }) => {
    try {
      const limit = typeof params.limit === "number" ? Math.min(params.limit, 200) : 50;
      const messages = readRecentMessages(limit);
      respond(true, { messages }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
