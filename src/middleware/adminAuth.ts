import type { Context, MiddlewareHandler } from 'hono';
import { ErrorCode } from '@robscholey/contracts';
import { NotFoundError, UnauthorizedError, verifyJWT } from '@/lib';
import type { Env } from '@/index';
import type { User } from '@/types';

/**
 * Path allowed to authenticate with `?token=` in the query string instead
 * of the `Authorization` header. The browser `EventSource` API doesn&rsquo;t
 * support custom headers, so the SSE stream endpoint has no other way to
 * carry the admin JWT.
 *
 * Scoped to this one path specifically — every other admin route still
 * requires the header, so a leaked query-string URL can&rsquo;t be replayed
 * against `GET /admin/codes` or friends.
 */
const STREAM_PATH = '/api/admin/stream';

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
 * opaque session token is never sent on the wire to admin routes. The one
 * exception is `GET /admin/stream`, which reads the JWT from the `?token=`
 * query param because `EventSource` can&rsquo;t set custom headers. Every
 * reject path throws {@link UnauthorizedError} so the shared `handleAppError`
 * middleware can emit the canonical `{ error: { code, message } }` envelope.
 */
export const adminAuth: MiddlewareHandler<Env> = async (c, next) => {
  const token = extractToken(c);
  if (!token) {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Unauthorized');
  }

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

/**
 * Pulls the JWT off the request. Prefers the `Authorization: Bearer <jwt>`
 * header; falls back to `?token=` query param for the SSE stream route only.
 */
function extractToken(c: Context<Env>): string | null {
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (c.req.path === STREAM_PATH) {
    const queryToken = c.req.query('token');
    if (queryToken) return queryToken;
  }
  return null;
}
