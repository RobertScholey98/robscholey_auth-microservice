import type { PresenceEntry, PresenceSnapshot, PresenceStatus } from '@robscholey/contracts';
import type { Database } from '@/lib';
import type { Session } from '@/types';

/** Sessions active within this window are rendered as `live` on the admin UI. */
export const LIVE_WINDOW_MS = 2 * 60 * 1000;

/** Sessions last active within this window (but outside {@link LIVE_WINDOW_MS}) are rendered as `idle`. */
export const IDLE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Classifies a session into a {@link PresenceStatus} by the age of its
 * `lastActiveAt` timestamp. Returns `null` for sessions that neither
 * belong on the live nor idle surface — the caller skips those instead
 * of folding them into an `off` bucket, since the admin UI only asks
 * for online presence.
 *
 * @param lastActiveAtMs - Epoch-ms timestamp of the session&rsquo;s last access.
 * @param now - Epoch-ms clock; injected for test determinism.
 * @returns `'live' | 'idle'` when the session fits a window, `null` otherwise.
 */
export function classifyPresence(
  lastActiveAtMs: number,
  now: number,
): PresenceStatus | null {
  const age = now - lastActiveAtMs;
  if (age < 0) return 'live';
  if (age < LIVE_WINDOW_MS) return 'live';
  if (age < IDLE_WINDOW_MS) return 'idle';
  return null;
}

/**
 * Builds a {@link PresenceEntry} from a session row.
 *
 * @param session - The session to project.
 * @param status - The presence status to stamp on the entry.
 * @returns A wire-shape entry ready to be placed in a snapshot or stream event.
 */
export function toPresenceEntry(session: Session, status: PresenceStatus): PresenceEntry {
  return {
    sessionToken: session.token,
    userId: session.userId,
    codeId: session.codeId,
    status,
    lastActiveAt: session.lastActiveAt.toISOString(),
    appIds: session.appIds,
  };
}

/**
 * Factory for the presence service. Purely read-only; never mutates the
 * database. Presence is derived — the source of truth is
 * `sessions.last_active_at`, which {@link createLoggingService} refreshes
 * on every access-log append.
 *
 * @param db - Database facade; only `sessions.list` is used.
 * @returns A service exposing a single `getSnapshot()` method.
 */
export function createPresenceService(db: Database) {
  return {
    /**
     * Returns the current live / idle snapshot. Expired sessions are
     * filtered out regardless of their last-active time.
     */
    async getSnapshot(): Promise<PresenceSnapshot> {
      const now = Date.now();
      const sessions = await db.sessions.list();
      const live: PresenceEntry[] = [];
      const idle: PresenceEntry[] = [];
      for (const session of sessions) {
        if (session.expiresAt.getTime() < now) continue;
        const status = classifyPresence(session.lastActiveAt.getTime(), now);
        if (!status) continue;
        const entry = toPresenceEntry(session, status);
        (status === 'live' ? live : idle).push(entry);
      }
      return { live, idle };
    },
  };
}

/** Public type of the presence service. */
export type PresenceService = ReturnType<typeof createPresenceService>;
