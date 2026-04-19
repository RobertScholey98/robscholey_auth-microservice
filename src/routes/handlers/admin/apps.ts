import type { Context } from 'hono';
import { db } from '@/lib';
import { loadAppsConfig } from '@/lib/appsConfig';

/** Lists all registered apps, annotated with `isOrphan` (true if missing from appsConfig.json). */
export async function listApps(c: Context) {
  const [apps, config] = await Promise.all([db.getApps(), loadAppsConfig()]);
  const configIds = new Set(config.map((a) => a.id));
  return c.json(apps.map((a) => ({ ...a, isOrphan: !configIds.has(a.id) })));
}

/** Toggles the `active` flag on an app. Body: `{ active: boolean }`. */
export async function patchAppActive(c: Context) {
  const id = c.req.param('id')!;
  const body = await c.req.json<{ active?: unknown }>();
  if (typeof body.active !== 'boolean') {
    return c.json({ error: 'active must be a boolean' }, 400);
  }

  const updated = await db.updateApp(id, { active: body.active });
  if (!updated) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json(updated);
}

/**
 * Deletes an app by ID. Gated to orphan apps (those not present in `appsConfig.json`).
 * Non-orphans must be removed from the config file first — prevents accidental loss
 * of an app that's still the committed source of truth.
 */
export async function deleteApp(c: Context) {
  const id = c.req.param('id')!;

  const config = await loadAppsConfig();
  if (config.some((a) => a.id === id)) {
    return c.json(
      { error: 'Remove this app from appsConfig.json before deleting it from the database' },
      400,
    );
  }

  const deleted = await db.deleteApp(id);
  if (!deleted) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json({ success: true });
}
