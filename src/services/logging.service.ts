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
     * session.appIds" check) then appends to the access log.
     *
     * @param input - Session token, app id, and user-agent string.
     */
    async record(input: RecordAccessInput): Promise<void> {
      const session = await sessionsService.validateActive(input.sessionToken, input.appId);

      await db.accessLogs.append({
        id: crypto.randomUUID(),
        sessionToken: input.sessionToken,
        codeId: session.codeId,
        appId: input.appId,
        accessedAt: new Date(),
        userAgent: input.userAgent,
      });
    },
  };
}

/** Public type of the logging service. */
export type LoggingService = ReturnType<typeof createLoggingService>;
