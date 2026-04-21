import { Pool } from 'pg';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp, type Env } from '@/index';
import { PostgresDatabase, createEventsBus, type EventsBus } from '@/lib';

/**
 * Bundle returned by {@link buildTestApp} — the live app instance, the
 * underlying Postgres handle so the caller can reset between tests and
 * close in `afterAll`, and the in-process events bus the app is wired to
 * so handler tests can assert on SSE emits without opening a real stream.
 */
export interface TestAppBundle {
  app: Hono<Env>;
  database: PostgresDatabase;
  events: EventsBus;
}

/**
 * Constructs a fresh Postgres-backed Hono app for a handler-test suite.
 *
 * Handler tests exercise the real SQL layer end-to-end, so each suite builds
 * a `PostgresDatabase` in `beforeAll` against the testcontainer `DATABASE_URL`
 * provided by global setup. Call {@link PostgresDatabase.close} via the
 * returned `database` in `afterAll` to release the pool.
 *
 * The returned {@link EventsBus} is the one handlers publish against through
 * the Hono context — subscribing lets tests assert that a write fanned out
 * the expected SSE event without opening a streaming connection.
 *
 * A silent logger is passed in so handler tests never spam the console; use
 * {@link ./logger.test.ts} and {@link ../../middleware/__tests__/requestLogger.test.ts}
 * for assertions on the logging contract.
 *
 * @returns The wired app, the database backing it, and the shared events bus.
 * @throws If `DATABASE_URL` is not set (globalSetup should always provide it).
 */
export function buildTestApp(): TestAppBundle {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for handler tests (set by globalSetup).');
  }
  const database = new PostgresDatabase(new Pool({ connectionString: url }));
  const silentLogger = pino({ level: 'silent' });
  const events = createEventsBus();
  const app = createApp(database, silentLogger, { events });
  return { app, database, events };
}
