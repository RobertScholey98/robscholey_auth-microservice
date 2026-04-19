import { ErrorCode } from '@robscholey/contracts';
import { ForbiddenError, NotFoundError, UnauthorizedError, type Database } from '@/lib';
import type { Session } from '@/types';

/** Optional filter applied to {@link SessionsService.list}. */
export interface SessionListFilters {
  /** When set, returns only sessions created from this access code. */
  codeId?: string;
}

/**
 * Factory for the sessions service. Thin wrappers around the sessions repo
 * except for {@link SessionsService.validateActive}, which centralises the
 * three-way "exists, not expired, permitted for app" check that both
 * `auth.getSession` and `logging.record` rely on.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns A sessions service bound to `db`.
 */
export function createSessionsService(db: Database) {
  return {
    /**
     * Lists sessions, optionally filtered by code id.
     * @param filters - Optional filter set.
     * @returns Matching sessions.
     */
    async list(filters: SessionListFilters = {}): Promise<Session[]> {
      if (filters.codeId !== undefined) {
        return db.sessions.getByCode(filters.codeId);
      }
      return db.sessions.list();
    },

    /**
     * Deletes a session by token. Throws {@link NotFoundError} if the session
     * does not exist.
     * @param token - Session token to delete.
     */
    async delete(token: string): Promise<void> {
      const deleted = await db.sessions.delete(token);
      if (!deleted) {
        throw new NotFoundError(ErrorCode.AdminSessionNotFound, 'Session not found');
      }
    },

    /**
     * Looks up a session and enforces active-session rules. Throws
     * {@link UnauthorizedError} when the session is missing or expired, and
     * {@link ForbiddenError} when an `appId` is supplied but not present in
     * the session's permitted app list.
     *
     * @param token - Session token to validate.
     * @param appId - When provided, require the session to grant access to this app.
     * @returns The active session.
     */
    async validateActive(token: string, appId?: string): Promise<Session> {
      const session = await db.sessions.get(token);
      if (!session) {
        throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Invalid session');
      }
      if (session.expiresAt < new Date()) {
        throw new UnauthorizedError(ErrorCode.AuthSessionExpired, 'Session expired');
      }
      if (appId !== undefined && !session.appIds.includes(appId)) {
        throw new ForbiddenError(
          ErrorCode.LoggingAppNotPermitted,
          'App not permitted for this session',
        );
      }
      return session;
    },
  };
}

/** Public type of the sessions service. Useful for service-inter-dependency params. */
export type SessionsService = ReturnType<typeof createSessionsService>;
