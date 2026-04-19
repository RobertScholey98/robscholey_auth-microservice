import { serve } from '@hono/node-server';
import migrate from 'node-pg-migrate';
import { Pool } from 'pg';
import { createApp } from './index';
import { PostgresDatabase } from './lib';
import { loadAppsConfig } from './lib/appsConfig';
import { seed } from './seed';
import { buildServices } from './services';

async function main() {
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

  console.log('  Running migrations...');
  await migrate({
    databaseUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
  console.log('  ✓ Migrations up to date');

  const database = new PostgresDatabase(new Pool({ connectionString: databaseUrl }));
  // Boot-time sync runs outside the HTTP layer, so it builds its own services
  // bundle. The request-serving app builds a parallel bundle against the same
  // database inside `createApp` — identical inputs, no runtime divergence.
  const bootServices = buildServices(database);

  const config = await loadAppsConfig();
  await bootServices.users.ensureOwner(adminUsername, adminPassword);
  const { synced, orphans } = await bootServices.apps.syncFromConfig(config);
  console.log(
    `  ✓ Boot sync: owner resynced, ${synced} app(s) from config, orphans: ${orphans.length ? orphans.join(', ') : 'none'}`,
  );

  await seed(database);

  const app = createApp(database);
  serve({ fetch: app.fetch, port: 3001 }, (info) => {
    console.log(`Auth service running at http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start auth service:', err);
  process.exit(1);
});
