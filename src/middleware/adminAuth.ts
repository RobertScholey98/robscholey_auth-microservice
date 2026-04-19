import type { MiddlewareHandler } from 'hono';
import { ErrorCode } from '@robscholey/contracts';
import { UnauthorizedError, verifyJWT, db } from '@/lib';

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
 * opaque session token is never sent on the wire to admin routes. Every
 * reject path throws {@link UnauthorizedError} so the shared `handleAppError`
 * middleware can emit the canonical `{ error: { code, message } }` envelope.
 */
export const adminAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token);
  if (!payload) {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
  }

  if (payload.type !== 'owner') {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
  }

  const user = await db.users.get(payload.sub);
  if (!user || user.type !== 'owner') {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
  }

  c.set('user', user);
  await next();
};
