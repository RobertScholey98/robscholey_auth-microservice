import type { MiddlewareHandler } from 'hono';
import { ErrorCode } from '@robscholey/contracts';
import { NotFoundError, UnauthorizedError, verifyJWT } from '@/lib';
import type { Env } from '@/index';
import type { User } from '@/types';

/**
 * Middleware that protects admin routes by verifying a short-lived JWT.
 *
 * Reads `Authorization: Bearer <jwt>` from the request header, verifies the
 * signature and expiry against `JWT_SIGNING_SECRET`, and requires the encoded
 * user type to be `owner`. The decoded user is then reloaded through the
 * users service for freshness (catches the rare case where the owner role
 * changed mid-session) and set on the Hono context as `user`.
 *
 * JWTs are issued by `/auth/login` and refreshed via `/auth/session`; the
 * opaque session token is never sent on the wire to admin routes. Every
 * reject path throws {@link UnauthorizedError} so the shared `handleAppError`
 * middleware can emit the canonical `{ error: { code, message } }` envelope.
 */
export const adminAuth: MiddlewareHandler<Env> = async (c, next) => {
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

  // `users.get` throws NotFoundError when the subject user has been deleted
  // mid-session; translate that to UnauthorizedError so admin routes stay
  // behind a single reject envelope.
  let user: User;
  try {
    user = await c.get('services').users.get(payload.sub);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
    }
    throw err;
  }

  if (user.type !== 'owner') {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
  }

  c.set('user', user);
  await next();
};
