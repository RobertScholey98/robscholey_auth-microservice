import type { Context } from 'hono';
import { db } from '@/lib';

/**
 * Logs an app access event. Called by the shell when an iframe loads.
 * Validates that the session exists before recording.
 */
export async function logAccess(c: Context) {
  const body = await c.req.json<{ sessionToken: string; appId: string }>();
  if (!body.sessionToken || !body.appId) {
    return c.json({ error: 'sessionToken and appId are required' }, 400);
  }

  const session = await db.getSession(body.sessionToken);
  if (!session) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  if (session.expiresAt < new Date()) {
    return c.json({ error: 'Session expired' }, 401);
  }

  if (!session.appIds.includes(body.appId)) {
    return c.json({ error: 'App not permitted for this session' }, 403);
  }

  await db.logAccess({
    id: crypto.randomUUID(),
    sessionToken: body.sessionToken,
    codeId: session.codeId,
    appId: body.appId,
    accessedAt: new Date(),
    userAgent: c.req.header('user-agent') ?? '',
  });

  return c.json({ success: true });
}
