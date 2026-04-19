import type { DB } from './db';
import type { AppConfig } from './appsConfig';

/** Result of a single apps-config → DB sync pass. */
export interface SyncAppsResult {
  /** Number of config entries processed (created + updated). */
  synced: number;
  /** IDs of apps present in the DB but missing from the config. */
  orphans: string[];
}

/**
 * Reconciles the DB's apps table with the structural config.
 *
 * For each entry in config:
 *   - If already in DB → updates structural fields. Preserves `active` for normal
 *     apps, force-resets `active: true` for owner-only apps (they're owner tooling
 *     that shouldn't be toggleable — always accessible to the owner).
 *   - Otherwise → inserts with `active: false` for normal apps, `active: true` for
 *     owner-only apps (so new admin-style apps appear on first boot without a
 *     manual unblock step).
 *
 * Apps present in the DB but missing from config are left untouched (orphans).
 * They're returned for logging and surfaced in the admin UI until removed.
 */
export async function syncApps(db: DB, config: AppConfig[]): Promise<SyncAppsResult> {
  const configIds = new Set(config.map((a) => a.id));

  for (const entry of config) {
    const ownerOnly = entry.ownerOnly === true;
    const existing = await db.getApp(entry.id);
    if (existing) {
      await db.updateApp(entry.id, {
        name: entry.name,
        url: entry.url,
        iconUrl: entry.iconUrl,
        description: entry.description,
        ...(ownerOnly ? { active: true } : {}),
      });
    } else {
      await db.createApp({ ...entry, active: ownerOnly });
    }
  }

  const allInDb = await db.getApps();
  const orphans = allInDb.filter((a) => !configIds.has(a.id)).map((a) => a.id);

  return { synced: config.length, orphans };
}
