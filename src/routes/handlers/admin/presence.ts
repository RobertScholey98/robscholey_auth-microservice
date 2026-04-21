import type { Context } from 'hono';
import type { Env } from '@/index';

/**
 * `GET /admin/presence` — returns the current live / idle presence snapshot
 * derived from `sessions.last_active_at`.
 *
 * Admin consumers pair this one-shot read with a subscription to the
 * `presence-delta` variant on `/admin/stream`: the snapshot hydrates the
 * initial UI state and each delta keeps it in sync between reloads.
 *
 * @param c - Hono context.
 * @returns JSON {@link import('@robscholey/contracts').PresenceSnapshot}.
 */
export async function getPresence(c: Context<Env>) {
  const snapshot = await c.get('services').presence.getSnapshot();
  return c.json(snapshot);
}
