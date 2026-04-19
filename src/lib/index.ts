import { Pool } from 'pg';
import { PostgresDatabase, type Database } from './db';

export {
  InMemoryDatabase,
  PostgresDatabase,
} from './db';
export type {
  Database,
  AppsRepo,
  UsersRepo,
  CodesRepo,
  SessionsRepo,
  AccessLogsRepo,
  AccessLogFilters,
} from './db';
export { hashPassword, comparePassword } from './password';
export { createSessionToken } from './session';
export { signJWT, verifyJWT } from './jwt';
export type { JWTPayload } from './jwt';
export {
  AppError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  handleAppError,
} from './errors';

/**
 * Builds the singleton database backend from the environment.
 *
 * Reads `DATABASE_URL` and returns a {@link PostgresDatabase}. Throws if the
 * variable is unset — production and tests both go through a real Postgres.
 * {@link InMemoryDatabase} is still exported for unit-level tests that want
 * a fast, dependency-free backend.
 */
function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Start Postgres (docker compose up -d postgres) and export DATABASE_URL before running auth.',
    );
  }
  return new PostgresDatabase(new Pool({ connectionString: url }));
}

/** Singleton database instance. Import this in route handlers to access data. */
export const db: Database = createDb();
