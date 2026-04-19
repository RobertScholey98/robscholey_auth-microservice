import type { Context } from 'hono';
import { patchAppActiveSchema, ErrorCode } from '@robscholey/contracts';
import { db, BadRequestError, NotFoundError } from '@/lib';
import { loadAppsConfig } from '@/lib/appsConfig';
import { appToWire } from '@/lib/wire';

/**
 * Lists all registered apps, annotated with `isOrphan` (true if missing from
 * appsConfig.json) and `ownerOnly` (mirrored from config for non-orphans).
 * Admin-only — regular auth responses filter orphan/owner-only apps out
 * entirely, so the annotations are not part of the shared wire `App`.
 */
export async function listApps(c: Context) {
  const [apps, config] = await Promise.all([db.getApps(), loadAppsConfig()]);
  const configById = new Map(config.map((a) => [a.id, a]));
  return c.json(
    apps.map((a) => {
      const cfg = configById.get(a.id);
      return {
        ...appToWire(a),
        isOrphan: !cfg,
        ownerOnly: cfg?.ownerOnly ?? false,
      };
    }),
  );
}

/**
 * Toggles the `active` flag on an app. Body: `{ active: boolean }`.
 * Owner-only apps reject toggles — they're force-active on every boot sync.
 */
export async function patchAppActive(c: Context) {
  const id = c.req.param('id')!;
  const body = patchAppActiveSchema.parse(await c.req.json());

  const config = await loadAppsConfig();
  const cfg = config.find((a) => a.id === id);
  if (cfg?.ownerOnly) {
    throw new BadRequestError(
      ErrorCode.AdminAppOwnerOnlyToggle,
      'Owner-only apps are always active and cannot be toggled',
    );
  }

  const updated = await db.updateApp(id, { active: body.active });
  if (!updated) {
    throw new NotFoundError(ErrorCode.AdminAppNotFound, 'App not found');
  }

  return c.json(appToWire(updated));
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
    throw new BadRequestError(
      ErrorCode.AdminAppInConfig,
      'Remove this app from appsConfig.json before deleting it from the database',
    );
  }

  const deleted = await db.deleteApp(id);
  if (!deleted) {
    throw new NotFoundError(ErrorCode.AdminAppNotFound, 'App not found');
  }

  return c.json({ success: true });
}
