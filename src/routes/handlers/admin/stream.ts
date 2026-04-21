import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { StreamEvent } from '@robscholey/contracts';
import type { Env } from '@/index';

/**
 * Interval between keep-alive heartbeat events. Sized well under the
 * typical 30-60s proxy idle-timeout so Caddy / nginx / friends don&rsquo;t
 * prune an otherwise quiet stream.
 */
const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * `GET /admin/stream` — opens a Server-Sent Events connection that delivers
 * every {@link StreamEvent} emitted on the in-process events bus to this
 * client. Auth is handled by {@link adminAuth}; the `?token=` query-string
 * fallback is why this path is special-cased there (EventSource can&rsquo;t
 * attach an `Authorization` header).
 *
 * The handler sets up three things and then parks the connection open:
 * 1. A subscriber on the events bus that writes each event to the stream
 *    as a JSON-encoded SSE frame.
 * 2. A 25-second heartbeat interval so idle connections don&rsquo;t look
 *    dead to intermediate proxies.
 * 3. Cleanup via `stream.onAbort` so a disconnecting client doesn&rsquo;t
 *    leak the subscription or the heartbeat timer.
 *
 * The Phase-2 scaffold emits only the heartbeat type; Phase 3a adds
 * `presence-delta`, Phase 2 adds `message-new`, Phase 3c adds
 * `audit-event`. Each lands as an additive variant on the shared
 * `StreamEvent` union with no change to this handler.
 *
 * @param c - Hono context; the events bus is attached under `c.get('events')`.
 * @returns A streaming response with `Content-Type: text/event-stream`.
 */
export async function stream(c: Context<Env>) {
  const events = c.get('events');
  return streamSSE(c, async (sseStream) => {
    const unsubscribe = events.subscribe((event: StreamEvent) => {
      sseStream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
        // `writeSSE` rejects if the client has hung up between the bus
        // firing and the write landing. Drop it — `onAbort` is the
        // authoritative cleanup path.
      });
    });

    const heartbeat = setInterval(() => {
      sseStream.writeSSE({ data: JSON.stringify({ type: 'heartbeat' }) }).catch(() => {
        // See writeSSE note above.
      });
    }, HEARTBEAT_INTERVAL_MS);

    sseStream.onAbort(() => {
      unsubscribe();
      clearInterval(heartbeat);
    });

    // Hold the connection open indefinitely; cleanup fires when the client
    // disconnects. `streamSSE` handles the HTTP transport lifecycle.
    await new Promise<void>(() => {});
  });
}
