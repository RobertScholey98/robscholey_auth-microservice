import type { Context } from 'hono';
import { db } from '@/lib';

/** Lists sessions, optionally filtered by `?codeId=`. */
export async function listSessions(c: Context) {
  const codeId = c.req.query('codeId');

  if (codeId) {
    return c.json(await db.getSessionsByCode(codeId));
  }

  return c.json(await db.getSessions());
}

/** Deletes a session by token. Returns 404 if not found. */
export async function deleteSession(c: Context) {
  const token = c.req.param('token')!;
  const deleted = await db.deleteSession(token);
  if (!deleted) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({ success: true });
}
