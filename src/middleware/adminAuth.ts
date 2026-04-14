import type { MiddlewareHandler } from 'hono';
import { db } from '../lib/db';

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
