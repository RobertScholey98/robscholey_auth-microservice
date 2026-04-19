import { db } from '@/lib';
import { createAnalyticsService } from './analytics.service';
import { createAppsService } from './apps.service';
import { createAuthService } from './auth.service';
import { createCodesService } from './codes.service';
import { createLoggingService } from './logging.service';
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
export { createPublicService, type PublicService } from './public.service';
export {
  createSessionsService,
  type SessionsService,
  type SessionListFilters,
} from './sessions.service';
export { createUsersService, type UsersService } from './users.service';

const sessions = createSessionsService(db);

/**
 * Singleton bundle of the eight domain services, each wired to the shared
 * {@link db} singleton. `logging` composes {@link sessions} explicitly so
 * session-freshness rules stay defined in one place.
 *
 * When A8 lands (Hono context DI), middleware will build per-request
 * instances with the same factories — the service bodies won't change.
 */
export const services = {
  auth: createAuthService(db),
  codes: createCodesService(db),
  users: createUsersService(db),
  apps: createAppsService(db),
  sessions,
  analytics: createAnalyticsService(db),
  logging: createLoggingService(db, sessions),
  public: createPublicService(db),
};

/** Aggregate type of the singleton services bundle. */
export type Services = typeof services;
