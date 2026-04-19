import { Pool } from 'pg';
import {
  InMemoryAppsRepo,
  PostgresAppsRepo,
  type AppsRepo,
} from './apps';
import {
  InMemoryUsersRepo,
  PostgresUsersRepo,
  type UsersRepo,
} from './users';
import {
  InMemoryCodesRepo,
  PostgresCodesRepo,
  type CodesRepo,
} from './codes';
import {
  InMemorySessionsRepo,
  PostgresSessionsRepo,
  type SessionsRepo,
} from './sessions';
import {
  InMemoryAccessLogsRepo,
  PostgresAccessLogsRepo,
  type AccessLogsRepo,
} from './access-logs';

export type { AppsRepo } from './apps';
export type { UsersRepo } from './users';
export type { CodesRepo } from './codes';
export type { SessionsRepo } from './sessions';
export type { AccessLogsRepo, AccessLogFilters } from './access-logs';

/**
 * Facade for the five per-aggregate repositories. Every data-access call in
 * the service goes through exactly one of these repos, keeping the surface
 * area of each aggregate small and substitutable.
 */
export interface Database {
  apps: AppsRepo;
  users: UsersRepo;
  codes: CodesRepo;
  sessions: SessionsRepo;
  accessLogs: AccessLogsRepo;
}

/**
 * In-memory {@link Database} composed of fresh {@link InMemoryAppsRepo}-family
 * repos. Intended for unit tests and local development — data is lost on
 * process exit.
 */
export class InMemoryDatabase implements Database {
  readonly apps: InMemoryAppsRepo;
  readonly users: InMemoryUsersRepo;
  readonly codes: InMemoryCodesRepo;
  readonly sessions: InMemorySessionsRepo;
  readonly accessLogs: InMemoryAccessLogsRepo;

  constructor() {
    this.apps = new InMemoryAppsRepo();
    this.users = new InMemoryUsersRepo();
    this.codes = new InMemoryCodesRepo();
    this.sessions = new InMemorySessionsRepo();
    this.accessLogs = new InMemoryAccessLogsRepo();
  }
}

/**
 * Postgres-backed {@link Database} composed of repos sharing a single
 * {@link Pool}. The pool is exposed as a public readonly field so the
 * test-only {@link resetDatabase} helper can issue a cross-table `TRUNCATE`.
 */
export class PostgresDatabase implements Database {
  readonly apps: PostgresAppsRepo;
  readonly users: PostgresUsersRepo;
  readonly codes: PostgresCodesRepo;
  readonly sessions: PostgresSessionsRepo;
  readonly accessLogs: PostgresAccessLogsRepo;

  /**
   * @param pool - Shared connection pool. Owned by the caller — close it on shutdown.
   */
  constructor(readonly pool: Pool) {
    this.apps = new PostgresAppsRepo(pool);
    this.users = new PostgresUsersRepo(pool);
    this.codes = new PostgresCodesRepo(pool);
    this.sessions = new PostgresSessionsRepo(pool);
    this.accessLogs = new PostgresAccessLogsRepo(pool);
  }

  /** Closes the underlying pool. Call on graceful shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
