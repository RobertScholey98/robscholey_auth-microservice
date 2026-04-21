import type { Context } from 'hono';
import type { Env } from '@/index';
import { _testResetRateLimit } from '@/middleware';

/**
 * `POST /admin/test/reset-rate-limit` — clears the in-memory rate-limit
 * bucket so E2E suites can re-run against the same long-lived dev auth
 * process without waiting out the 60-second window.
 *
 * Gated by {@link testOnly} — only reachable when `ENABLE_TEST_ENDPOINTS=1`.
 *
 * @param c - Hono context.
 * @returns JSON `{ success: true }`.
 */
export function resetRateLimit(c: Context<Env>) {
  _testResetRateLimit();
  return c.json({ success: true });
}
