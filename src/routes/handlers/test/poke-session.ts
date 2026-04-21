import type { Context } from 'hono';
import { z } from 'zod';
import type { Env } from '@/index';

/**
 * Request body for {@link pokeSession}. Rebackdates a session&rsquo;s
 * `last_active_at` by `backdateMs` milliseconds. Only reachable when
 * `ENABLE_TEST_ENDPOINTS=1` — see {@link testOnly}.
 *
 * Kept alongside the handler rather than hoisted into
 * `@robscholey/contracts` because test-only affordances shouldn&rsquo;t
 * pollute the public wire-shape surface; the E2E harness hits the endpoint
 * with raw `fetch`.
 */
const pokeSessionSchema = z.object({
  sessionToken: z.string().min(1, 'sessionToken is required'),
  backdateMs: z.number().int().nonnegative(),
});

/**
 * `POST /admin/test/poke-session` — advances a session&rsquo;s
 * `last_active_at` backwards in time so E2E specs can verify presence
 * transitions (live → idle → off) without real-world wall-clock delays.
 *
 * Always paired with {@link testOnly} middleware; on a correctly-configured
 * service this endpoint only exists when `ENABLE_TEST_ENDPOINTS=1`.
 *
 * @param c - Hono context.
 * @returns JSON `{ success: true, lastActiveAt: ISO }`.
 */
export async function pokeSession(c: Context<Env>) {
  const body = pokeSessionSchema.parse(await c.req.json());
  const newActiveAt = new Date(Date.now() - body.backdateMs);
  const updated = await c
    .get('services')
    .sessions._testSetLastActiveAt(body.sessionToken, newActiveAt);
  return c.json({
    success: true,
    lastActiveAt: updated?.lastActiveAt?.toISOString() ?? null,
  });
}
