import type { Context } from 'hono';
import { logAccessSchema } from '@robscholey/contracts';
import type { Env } from '@/index';

/**
 * Logs an app access event. Called by the shell when an iframe loads.
 * Validates that the session exists and permits the app before recording.
 */
export async function logAccess(c: Context<Env>) {
  const body = logAccessSchema.parse(await c.req.json());
  await c.get('services').logging.record({
    sessionToken: body.sessionToken,
    appId: body.appId,
    userAgent: c.req.header('user-agent') ?? '',
  });
  return c.json({ success: true });
}
