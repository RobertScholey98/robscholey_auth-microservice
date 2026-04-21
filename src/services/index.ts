import type { Database } from '@/lib';
import { createAnalyticsService } from './analytics.service';
import { createAppsService } from './apps.service';
import { createAuthService } from './auth.service';
import { createCodesService } from './codes.service';
import { createLoggingService } from './logging.service';
import { createMessagingService } from './messaging.service';
import { createPresenceService } from './presence.service';
import { createPublicService } from './public.service';
import { createSessionsService } from './sessions.service';
import { createUsersService } from './users.service';

export {
  createAnalyticsService,
  type AnalyticsService,
  type AnalyticsResult,
} from './analytics.service';
export {
  createAppsService,
  type AppsService,
  type AdminAppListEntry,
  type SyncAppsResult,
} from './apps.service';
export { createAuthService, type AuthService } from './auth.service';
export { createCodesService, type CodesService } from './codes.service';
export {
  createLoggingService,
  type LoggingService,
  type RecordAccessInput,
} from './logging.service';
export {
  createMessagingService,
  type MessagingService,
  type SendMessageResult,
} from './messaging.service';
export { createPresenceService, type PresenceService } from './presence.service';
export { createPublicService, type PublicService } from './public.service';
export {
  createSessionsService,
  type SessionsService,
  type SessionListFilters,
} from './sessions.service';
export { createUsersService, type UsersService } from './users.service';

/**
 * Builds the services bundle against a given {@link Database}. Called
 * once per `createApp` invocation; the returned bundle is attached to every
 * request via Hono context so handlers never reach for a module-level
 * singleton.
 *
 * `logging` composes `sessions` explicitly so session-freshness rules stay
 * defined in one place.
 *
 * @param db - The database every service in the bundle will read and write.
 * @returns A fresh services bundle wired to the given {@link Database}.
 */
export function buildServices(db: Database) {
  const sessions = createSessionsService(db);
  return {
    auth: createAuthService(db),
    codes: createCodesService(db),
    users: createUsersService(db),
    apps: createAppsService(db),
    sessions,
    analytics: createAnalyticsService(db),
    logging: createLoggingService(db, sessions),
    presence: createPresenceService(db),
    public: createPublicService(db),
    messaging: createMessagingService(db),
  };
}

/** Aggregate type of the services bundle returned by {@link buildServices}. */
export type Services = ReturnType<typeof buildServices>;
