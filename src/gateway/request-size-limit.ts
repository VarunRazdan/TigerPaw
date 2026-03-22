/**
 * Request size limit enforcement for the Tigerpaw gateway.
 *
 * Provides HTTP body and WebSocket frame size limits to prevent
 * resource exhaustion from oversized payloads.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestSizeLimitConfig = {
  /** Maximum HTTP request body size in bytes. @default 1_048_576 (1 MB) */
  httpBodyMaxBytes?: number;
  /** Maximum WebSocket frame size in bytes. @default 262_144 (256 KB) */
  wsFrameMaxBytes?: number;
};

const DEFAULT_HTTP_BODY_MAX_BYTES = 1_048_576; // 1 MB
const DEFAULT_WS_FRAME_MAX_BYTES = 262_144; // 256 KB

export function resolveHttpBodyMaxBytes(config?: RequestSizeLimitConfig): number {
  return config?.httpBodyMaxBytes ?? DEFAULT_HTTP_BODY_MAX_BYTES;
}

export function resolveWsFrameMaxBytes(config?: RequestSizeLimitConfig): number {
  return config?.wsFrameMaxBytes ?? DEFAULT_WS_FRAME_MAX_BYTES;
}

/**
 * Check Content-Length header against the body size limit.
 * Returns true if the request should be rejected (413 already sent).
 */
export function rejectOversizedBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
): boolean {
  const contentLength = req.headers["content-length"];
  if (!contentLength) {
    return false;
  }

  const size = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(size)) {
    return false;
  }

  if (size > maxBytes) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Payload Too Large",
        maxBytes,
        receivedBytes: size,
      }),
    );
    return true;
  }

  return false;
}

const DEFAULT_BODY_TIMEOUT_MS = 30_000;

/**
 * Collect request body with size enforcement.
 * Resolves with the body buffer, or rejects if the limit is exceeded mid-stream.
 *
 * @param timeoutMs  Slowloris protection: maximum time to wait for the full body
 *                   before destroying the request. Defaults to 30 000 ms.
 */
export function collectBodyWithLimit(
  req: IncomingMessage,
  maxBytes: number,
  timeoutMs: number = DEFAULT_BODY_TIMEOUT_MS,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    // Slowloris protection: reject if body collection takes too long.
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        reject(new Error(`request body collection timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    timer.unref?.();

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          req.destroy();
          reject(new Error(`request body exceeds ${maxBytes} bytes`));
        }
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      }
    });

    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}
