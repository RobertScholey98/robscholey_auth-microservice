import { ErrorCode } from '@robscholey/contracts';
import { BadRequestError, NotFoundError, type Database } from '@/lib';
import { loadAppsConfig, type AppConfig } from '@/lib/appsConfig';
import type { App } from '@/types';

/**
 * Admin listing entry — the domain app plus two config-derived annotations.
 * Kept on the domain shape (not wire) so the handler does the final wire map
 * uniformly with every other list endpoint.
 */
export interface AdminAppListEntry extends App {
  /** `true` when the app is present in the DB but missing from `appsConfig.json`. */
  isOrphan: boolean;
  /** Mirrored from config. Always `false` for orphans. */
  ownerOnly: boolean;
}

/** Result of a single apps-config → DB sync pass. */
export interface SyncAppsResult {
  /** Number of config entries processed (created + updated). */
  synced: number;
  /** IDs of apps present in the DB but missing from the config. */
  orphans: string[];
}

/**
 * Factory for the apps service. Owns runtime app management (active toggle,
 * orphan removal, admin-annotated listing) and the boot-time
 * config-reconciliation pass migrated from the former `appsSync.ts`.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns An apps service bound to `db`.
 */
export function createAppsService(db: Database) {
  return {
    /** Returns all registered apps. */
    async list(): Promise<App[]> {
      return db.apps.list();
    },

    /**
     * Admin listing: joins every DB app with `appsConfig.json` and annotates
     * each entry with `isOrphan` (missing from config) and `ownerOnly`
     * (mirrored from config). Orphans and owner-only apps are filtered out
     * of shell-facing responses entirely; the annotations are for the admin
     * UI only.
     */
    async listWithAdminAnnotations(): Promise<AdminAppListEntry[]> {
      const [apps, config] = await Promise.all([db.apps.list(), loadAppsConfig()]);
      const configById = new Map(config.map((a) => [a.id, a]));
      return apps.map((a) => {
        const cfg = configById.get(a.id);
        return {
          ...a,
          isOrphan: !cfg,
          ownerOnly: cfg?.ownerOnly ?? false,
        };
      });
    },

    /**
     * Toggles the `active` flag on an app. Rejects owner-only apps, which
     * are force-active on every boot sync and therefore not toggleable.
     * Throws {@link BadRequestError} for owner-only targets and
     * {@link NotFoundError} for unknown app ids.
     *
     * @param id - App id.
     * @param active - Desired active state.
     */
    async toggleActive(id: string, active: boolean): Promise<App> {
      const config = await loadAppsConfig();
      const cfg = config.find((a) => a.id === id);
      if (cfg?.ownerOnly) {
        throw new BadRequestError(
          ErrorCode.AdminAppOwnerOnlyToggle,
          'Owner-only apps are always active and cannot be toggled',
        );
      }

      const updated = await db.apps.update(id, { active });
      if (!updated) {
        throw new NotFoundError(ErrorCode.AdminAppNotFound, 'App not found');
      }
      return updated;
    },

    /**
     * Deletes an orphan app (missing from `appsConfig.json`). Non-orphans
     * must be removed from the config first — prevents accidental loss of
     * an app that's still the committed source of truth. Throws
     * {@link BadRequestError} for in-config targets and
     * {@link NotFoundError} for unknown app ids.
     *
     * @param id - App id.
     */
    async removeOrphan(id: string): Promise<void> {
      const config = await loadAppsConfig();
      if (config.some((a) => a.id === id)) {
        throw new BadRequestError(
          ErrorCode.AdminAppInConfig,
          'Remove this app from appsConfig.json before deleting it from the database',
        );
      }

      const deleted = await db.apps.delete(id);
      if (!deleted) {
        throw new NotFoundError(ErrorCode.AdminAppNotFound, 'App not found');
      }
    },

    /**
     * Reconciles the DB's apps table with the structural config.
     *
     * For each entry in config:
     *   - If already in DB → updates structural fields. Preserves `active`
     *     for normal apps, force-resets `active: true` for owner-only apps
     *     (they're owner tooling that shouldn't be toggleable — always
     *     accessible to the owner).
     *   - Otherwise → inserts with `active: false` for normal apps,
     *     `active: true` for owner-only apps (so new admin-style apps
     *     appear on first boot without a manual unblock step).
     *
     * Apps present in the DB but missing from config are left untouched
     * (orphans). They're returned for logging and surfaced in the admin UI
     * until removed.
     *
     * @param config - The full parsed apps config.
     */
    async syncFromConfig(config: AppConfig[]): Promise<SyncAppsResult> {
      const configIds = new Set(config.map((a) => a.id));

      for (const entry of config) {
        const ownerOnly = entry.ownerOnly ?? false;
        const selectorMetadata = {
          version: entry.version,
          lastUpdatedAt: entry.lastUpdatedAt ? new Date(entry.lastUpdatedAt) : undefined,
          statusVariant: entry.statusVariant,
          visualKey: entry.visualKey,
        };
        const existing = await db.apps.get(entry.id);
        if (existing) {
          await db.apps.update(entry.id, {
            name: entry.name,
            url: entry.url,
            iconUrl: entry.iconUrl,
            description: entry.description,
            ...selectorMetadata,
            ...(ownerOnly ? { active: true } : {}),
          });
        } else {
          await db.apps.create({
            id: entry.id,
            name: entry.name,
            url: entry.url,
            iconUrl: entry.iconUrl,
            description: entry.description,
            active: ownerOnly,
            ...selectorMetadata,
          });
        }
      }

      const allInDb = await db.apps.list();
      const orphans = allInDb.filter((a) => !configIds.has(a.id)).map((a) => a.id);

      return { synced: config.length, orphans };
    },
  };
}

/** Public type of the apps service. */
export type AppsService = ReturnType<typeof createAppsService>;
