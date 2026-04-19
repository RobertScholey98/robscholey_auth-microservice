import { ErrorCode } from '@robscholey/contracts';
import type { AppMeta } from '@robscholey/contracts';
import { NotFoundError, type Database } from '@/lib';

/**
 * Factory for the public (no-auth) service. Returns public app metadata
 * used by both the JSON meta endpoint and the placeholder-SVG icon endpoint.
 * SVG rendering belongs to the handler — it's a transport format, not domain
 * logic — so this service stops at the metadata.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns A public service bound to `db`.
 */
export function createPublicService(db: Database) {
  return {
    /**
     * Returns public metadata for an active app. Throws {@link NotFoundError}
     * if the app does not exist or is inactive. Shared by the meta and icon
     * handlers — the icon handler renders a placeholder SVG from the returned
     * name.
     * @param slug - App id.
     */
    async getAppMeta(slug: string): Promise<AppMeta> {
      const meta = await db.apps.getMeta(slug);
      if (!meta) {
        throw new NotFoundError(ErrorCode.NotFound, 'App not found');
      }
      return meta;
    },
  };
}

/** Public type of the public service. */
export type PublicService = ReturnType<typeof createPublicService>;
