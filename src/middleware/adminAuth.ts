import type { MiddlewareHandler } from 'hono';
import { db } from '@/lib';

/**
 * Middleware that validates the request is from an authenticated owner.
 * Reads `Authorization: Bearer <session-token>` from the header, verifies the session
 * exists and belongs to an owner user, and sets the user on the Hono context.
 * Returns 401 for all failure cases with a generic error message.
 */
export const adminAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const session = await db.getSession(token);
  if (!session) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  if (session.expiresAt < new Date()) {
    await db.deleteSession(token);
    return c.json({ error: 'Session expired' }, 401);
  }

  if (!session.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await db.getUser(session.userId);
  if (!user || user.type !== 'owner') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
};
