import type { MiddlewareHandler } from 'hono';

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

function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip = getClientIP(c);
  const now = Date.now();
  const entry = store.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      return c.json(
        { error: 'Too many attempts. Try again later.' },
        429
      );
    }
    entry.count++;
  } else {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  await next();
};
