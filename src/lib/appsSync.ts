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
 *   - If already in DB → updates structural fields (name/url/iconUrl/description),
 *     preserving the DB-owned `active` flag.
 *   - Otherwise → inserts with `active: false`. New apps are staged; flip active
 *     in the admin UI once the app is verified.
 *
 * Apps present in the DB but missing from config are left untouched (orphans).
 * They're returned for logging and surfaced in the admin UI until removed.
 */
export async function syncApps(db: DB, config: AppConfig[]): Promise<SyncAppsResult> {
  const configIds = new Set(config.map((a) => a.id));

  for (const entry of config) {
    const existing = await db.getApp(entry.id);
    if (existing) {
      await db.updateApp(entry.id, {
        name: entry.name,
        url: entry.url,
        iconUrl: entry.iconUrl,
        description: entry.description,
      });
    } else {
      await db.createApp({ ...entry, active: false });
    }
  }

  const allInDb = await db.getApps();
  const orphans = allInDb.filter((a) => !configIds.has(a.id)).map((a) => a.id);

  return { synced: config.length, orphans };
}
