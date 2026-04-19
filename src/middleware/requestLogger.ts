import type { MiddlewareHandler } from 'hono';
import type { Logger } from '@/lib';
import type { Env } from '@/index';

/**
 * Builds a request-scoped logger middleware. The returned handler spawns a
 * pino child logger bound with `requestId`, `method`, and `path` on every
 * request, attaches it to the Hono context as `logger`, and brackets
 * `next()` with matching `http.request.start` / `http.request.finish`
 * events so the pair is always emitted even when a handler throws.
 *
 * The `finish` event fires from a `finally` block; downstream error middleware
 * still runs first and surfaces its own structured log. `finish` reflects
 * whatever status the error handler wrote.
 *
 * @param root - The root logger that child loggers derive from.
 * @returns A Hono middleware that attaches `logger` to the request context.
 */
export function requestLogger(root: Logger): MiddlewareHandler<Env> {
  return async (c, next) => {
    const requestId = c.get('requestId');
    const method = c.req.method;
    const path = c.req.path;

    const child = root.child({ requestId, method, path });
    c.set('logger', child);

    const start = performance.now();
    child.info({ event: 'http.request.start' });
    try {
      await next();
    } finally {
      const durationMs = Math.round(performance.now() - start);
      child.info({ event: 'http.request.finish', status: c.res.status, durationMs });
    }
  };
}
