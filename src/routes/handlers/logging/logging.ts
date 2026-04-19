import type { Context } from 'hono';
import { logAccessSchema, ErrorCode } from '@robscholey/contracts';
import { db, ForbiddenError, UnauthorizedError } from '@/lib';

/**
 * Logs an app access event. Called by the shell when an iframe loads.
 * Validates that the session exists before recording.
 */
export async function logAccess(c: Context) {
  const body = logAccessSchema.parse(await c.req.json());

  const session = await db.getSession(body.sessionToken);
  if (!session) {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Invalid session');
  }

  if (session.expiresAt < new Date()) {
    throw new UnauthorizedError(ErrorCode.AuthSessionExpired, 'Session expired');
  }

  if (!session.appIds.includes(body.appId)) {
    throw new ForbiddenError(
      ErrorCode.LoggingAppNotPermitted,
      'App not permitted for this session',
    );
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
