import type { Context } from 'hono';
import { ErrorCode } from '@robscholey/contracts';
import { db, NotFoundError } from '@/lib';
import { sessionToWire } from '@/lib/wire';

/** Lists sessions, optionally filtered by `?codeId=`. */
export async function listSessions(c: Context) {
  const codeId = c.req.query('codeId');

  if (codeId) {
    const sessions = await db.getSessionsByCode(codeId);
    return c.json(sessions.map(sessionToWire));
  }

  const sessions = await db.getSessions();
  return c.json(sessions.map(sessionToWire));
}

/** Deletes a session by token. Returns 404 if not found. */
export async function deleteSession(c: Context) {
  const token = c.req.param('token')!;
  const deleted = await db.deleteSession(token);
  if (!deleted) {
    throw new NotFoundError(ErrorCode.AdminSessionNotFound, 'Session not found');
  }

  return c.json({ success: true });
}
