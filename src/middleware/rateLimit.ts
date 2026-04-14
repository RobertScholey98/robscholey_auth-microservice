import type { MiddlewareHandler } from 'hono';

/** Tracks the number of requests from an IP within a time window. */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

// Clean up expired entries periodically to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, WINDOW_MS);

/**
 * Extracts the client IP address from proxy headers.
 * @param c - The Hono context (narrowed to the header accessor).
 * @returns The client IP, or `"unknown"` if no proxy headers are present.
 */
function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'unknown'
  );
}

/**
 * In-memory rate limiting middleware. Allows {@link MAX_ATTEMPTS} requests per IP
 * within a {@link WINDOW_MS} window. Returns 429 when exceeded.
 */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip = getClientIP(c);
  const now = Date.now();
  const entry = store.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      return c.json({ error: 'Too many attempts. Try again later.' }, 429);
    }
    entry.count++;
  } else {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  await next();
};

/** Clears all rate limit state. Test-only — not part of the public API. */
export function _testResetRateLimit(): void {
  store.clear();
}
