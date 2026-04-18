import type { MiddlewareHandler } from 'hono';
import { verifyJWT, db } from '@/lib';

/**
 * Middleware that protects admin routes by verifying a short-lived JWT.
 *
 * Reads `Authorization: Bearer <jwt>` from the request header, verifies the
 * signature and expiry against `JWT_SIGNING_SECRET`, and requires the encoded
 * user type to be `owner`. The decoded user is then reloaded from the DB for
 * freshness (catches the rare case where the owner role changed mid-session)
 * and set on the Hono context as `user`.
 *
 * JWTs are issued by `/auth/login` and refreshed via `/auth/session`; the
 * opaque session token is never sent on the wire to admin routes.
 */
export const adminAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (payload.type !== 'owner') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await db.getUser(payload.sub);
  if (!user || user.type !== 'owner') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
};
