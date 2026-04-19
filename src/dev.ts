import { serve } from '@hono/node-server';
import migrate from 'node-pg-migrate';
import { Pool } from 'pg';
import { createApp } from './index';
import { PostgresDatabase, createLogger } from './lib';
import { loadAppsConfig } from './lib/appsConfig';
import { seed } from './seed';
import { buildServices } from './services';

/** Port the auth service binds to locally and inside the container. */
const AUTH_SERVICE_PORT = 3001;

async function main() {
  const logger = createLogger({ name: 'auth' });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Start Postgres (docker compose up -d postgres) and export DATABASE_URL before running auth.',
    );
  }

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    throw new Error(
      'ADMIN_USERNAME and ADMIN_PASSWORD are required. Set them in .env before starting auth.',
    );
  }

  logger.info({ event: 'boot.migrations.start' });
  await migrate({
    databaseUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
  logger.info({ event: 'boot.migrations.complete' });

  const database = new PostgresDatabase(new Pool({ connectionString: databaseUrl }));
  // Boot-time sync runs outside the HTTP layer, so it builds its own services
  // bundle. The request-serving app builds a parallel bundle against the same
  // database inside `createApp` — identical inputs, no runtime divergence.
  const bootServices = buildServices(database);

  const config = await loadAppsConfig();
  await bootServices.users.ensureOwner(adminUsername, adminPassword);
  const { synced, orphans } = await bootServices.apps.syncFromConfig(config);
  logger.info(
    { event: 'boot.sync.complete', synced, orphans },
    'Boot sync: owner resynced, apps from config, orphans listed',
  );

  await seed(database, logger);

  const app = createApp(database, logger);
  serve({ fetch: app.fetch, port: AUTH_SERVICE_PORT }, (info) => {
    logger.info({ event: 'boot.server.listening', port: info.port });
  });
}

main().catch((err) => {
  // Root logger isn't in scope here, so construct a one-shot logger for the
  // fatal line. Keeping the side effect (process.exit) colocated with its log
  // means nothing escapes to stderr unstructured.
  createLogger({ name: 'auth' }).fatal({ err }, 'Failed to start auth service');
  process.exit(1);
});
