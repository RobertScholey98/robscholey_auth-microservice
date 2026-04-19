import type { Context } from 'hono';
import { sessionToWire } from '@/lib/wire';
import type { Env } from '@/index';

/** Lists sessions, optionally filtered by `?codeId=`. */
export async function listSessions(c: Context<Env>) {
  // Query params arrive as `string | undefined`; coerce `?codeId=` (empty
  // string) to undefined so the service's "no filter" branch fires — matches
  // the pre-refactor handler's truthy check.
  const codeId = c.req.query('codeId') || undefined;
  const sessions = await c.get('services').sessions.list({ codeId });
  return c.json(sessions.map(sessionToWire));
}

/**
 * Deletes a session by token. Returns 404 if not found.
 *
 * The session token is deliberately omitted from the domain event — logs
 * ship to operators and anything that lands in stdout is fair game for a
 * future log store, so opaque tokens stay out of the record entirely.
 */
export async function deleteSession(c: Context<Env>) {
  const token = c.req.param('token')!;
  await c.get('services').sessions.delete(token);
  c.get('logger').info({ event: 'admin.sessions.delete' });
  return c.json({ success: true });
}
