import type { Context } from 'hono';
import { logAccessSchema } from '@robscholey/contracts';
import type { Env } from '@/index';

/**
 * Logs an app access event. Called by the shell when an iframe loads.
 * Validates that the session exists and permits the app before recording.
 *
 * Emits `access.record` on success. The session token is never included in
 * the event — it's the privacy-sensitive half of the input.
 */
export async function logAccess(c: Context<Env>) {
  const body = logAccessSchema.parse(await c.req.json());
  const { codeId } = await c.get('services').logging.record({
    sessionToken: body.sessionToken,
    appId: body.appId,
    userAgent: c.req.header('user-agent') ?? '',
  });
  c.get('logger').info({ event: 'access.record', appId: body.appId, codeId });
  return c.json({ success: true });
}
