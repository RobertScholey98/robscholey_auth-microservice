import type { Database } from '@/lib';
import type { SessionsService } from './sessions.service';

/** Input to {@link LoggingService.record}. */
export interface RecordAccessInput {
  /** Session token initiating the access. */
  sessionToken: string;
  /** App being accessed. Validated against the session's permitted list. */
  appId: string;
  /** Opaque user agent string from the HTTP request. */
  userAgent: string;
}

/**
 * Factory for the logging service. Owns the single write path for access
 * logs and composes {@link SessionsService.validateActive} so session
 * freshness rules stay defined in one place.
 *
 * `sessionsService` is passed in explicitly rather than imported from a
 * module-level singleton so unit-testing this service is straightforward
 * and the composition graph stays visible in `services/index.ts`.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @param sessionsService - Already-constructed sessions service used for validation.
 * @returns A logging service bound to both.
 */
export function createLoggingService(db: Database, sessionsService: SessionsService) {
  return {
    /**
     * Records a single access event. Delegates session validity to
     * {@link SessionsService.validateActive} (including the "appId is in
     * session.appIds" check) then appends to the access log and refreshes
     * the session's `lastActiveAt` timestamp.
     *
     * The `lastActiveAt` refresh is what makes presence derivation honest:
     * the shell pings this endpoint every time an iframe loads, so a
     * thin "session last seen within N minutes" query in the admin
     * presence endpoint reflects actual activity rather than frozen
     * create-time.
     *
     * Returns the resolved `codeId` so the caller can emit it on the
     * handler-side domain event without re-fetching the session. Nullable
     * because a direct owner login has no code. This is the hook the
     * future live-engagement feature (notify on first use of a code)
     * will read from — see
     * `AGENT_TEMP_FILES/future_features/live-recruiter-engagement.md`.
     *
     * @param input - Session token, app id, and user-agent string.
     * @returns The `codeId` of the session whose access was recorded, or
     *   `null` if the session was created by a direct owner login.
     */
    async record(input: RecordAccessInput): Promise<{ codeId: string | null }> {
      const session = await sessionsService.validateActive(input.sessionToken, input.appId);
      const now = new Date();

      await db.accessLogs.append({
        id: crypto.randomUUID(),
        sessionToken: input.sessionToken,
        codeId: session.codeId,
        appId: input.appId,
        accessedAt: now,
        userAgent: input.userAgent,
      });

      await db.sessions.update(input.sessionToken, { lastActiveAt: now });

      return { codeId: session.codeId };
    },
  };
}

/** Public type of the logging service. */
export type LoggingService = ReturnType<typeof createLoggingService>;
