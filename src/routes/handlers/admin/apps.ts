import type { Context } from 'hono';
import { patchAppActiveSchema } from '@robscholey/contracts';
import { appToWire } from '@/lib/wire';
import { services } from '@/services';

/**
 * Lists all registered apps, annotated with `isOrphan` (true if missing from
 * `appsConfig.json`) and `ownerOnly` (mirrored from config for non-orphans).
 * Admin-only — regular auth responses filter these out entirely, so the
 * annotations are not part of the shared wire `App`.
 */
export async function listApps(c: Context) {
  const entries = await services.apps.listWithAdminAnnotations();
  return c.json(
    entries.map((e) => ({
      ...appToWire(e),
      isOrphan: e.isOrphan,
      ownerOnly: e.ownerOnly,
    })),
  );
}

/**
 * Toggles the `active` flag on an app. Body: `{ active: boolean }`.
 * Owner-only apps reject toggles — they're force-active on every boot sync.
 */
export async function patchAppActive(c: Context) {
  const id = c.req.param('id')!;
  const body = patchAppActiveSchema.parse(await c.req.json());
  const updated = await services.apps.toggleActive(id, body.active);
  return c.json(appToWire(updated));
}

/**
 * Deletes an orphan app (not present in `appsConfig.json`). Non-orphans must
 * be removed from the config file first — prevents accidental loss of an app
 * that's still the committed source of truth.
 */
export async function deleteApp(c: Context) {
  const id = c.req.param('id')!;
  await services.apps.removeOrphan(id);
  return c.json({ success: true });
}
