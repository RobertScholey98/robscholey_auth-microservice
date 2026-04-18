import type { DB } from './db';
import { PostgresDB } from './postgres-db';

export { InMemoryDB } from './db';
export { PostgresDB } from './postgres-db';
export type { DB } from './db';
export { hashPassword, comparePassword } from './password';
export { createSessionToken } from './session';
export { signJWT, verifyJWT } from './jwt';
export type { JWTPayload } from './jwt';

/**
 * Builds the singleton database backend from the environment.
 *
 * Reads `DATABASE_URL` and returns a {@link PostgresDB}. Throws if the
 * variable is unset — production and tests both go through a real Postgres.
 * `InMemoryDB` is still exported for unit-level tests that want a fast,
 * dependency-free backend.
 */
function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Start Postgres (docker compose up -d postgres) and export DATABASE_URL before running auth.',
    );
  }
  return new PostgresDB(url);
}

/** Singleton database instance. Import this in route handlers to access data. */
export const db: DB = createDb();
