import type { Context } from 'hono';
import { sessionToWire } from '@/lib/wire';
import { services } from '@/services';

/** Lists sessions, optionally filtered by `?codeId=`. */
export async function listSessions(c: Context) {
  // Query params arrive as `string | undefined`; coerce `?codeId=` (empty
  // string) to undefined so the service's "no filter" branch fires — matches
  // the pre-refactor handler's truthy check.
  const codeId = c.req.query('codeId') || undefined;
  const sessions = await services.sessions.list({ codeId });
  return c.json(sessions.map(sessionToWire));
}

/** Deletes a session by token. Returns 404 if not found. */
export async function deleteSession(c: Context) {
  const token = c.req.param('token')!;
  await services.sessions.delete(token);
  return c.json({ success: true });
}
