import { Pool } from 'pg';
import type { Hono } from 'hono';
import { createApp, type Env } from '@/index';
import { PostgresDatabase } from '@/lib';

/**
 * Bundle returned by {@link buildTestApp} — the live app instance and the
 * underlying Postgres handle so the caller can reset between tests and close
 * in `afterAll`.
 */
export interface TestAppBundle {
  app: Hono<Env>;
  database: PostgresDatabase;
}

/**
 * Constructs a fresh Postgres-backed Hono app for a handler-test suite.
 *
 * Handler tests exercise the real SQL layer end-to-end, so each suite builds
 * a `PostgresDatabase` in `beforeAll` against the testcontainer `DATABASE_URL`
 * provided by global setup. Call {@link PostgresDatabase.close} via the
 * returned `database` in `afterAll` to release the pool.
 *
 * @returns The wired app and the database backing it.
 * @throws If `DATABASE_URL` is not set (globalSetup should always provide it).
 */
export function buildTestApp(): TestAppBundle {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for handler tests (set by globalSetup).');
  }
  const database = new PostgresDatabase(new Pool({ connectionString: url }));
  const app = createApp(database);
  return { app, database };
}
