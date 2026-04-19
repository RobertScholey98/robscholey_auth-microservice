import { serve } from '@hono/node-server';
import migrate from 'node-pg-migrate';
import app from './index';
import { db } from './lib';
import { loadAppsConfig } from './lib/appsConfig';
import { syncOwner } from './lib/ownerSync';
import { syncApps } from './lib/appsSync';
import { seed } from './seed';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Start Postgres (docker compose up -d postgres) and export DATABASE_URL before running auth.',
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

  const config = await loadAppsConfig();
  await syncOwner(db);
  const { synced, orphans } = await syncApps(db, config);
  console.log(
    `  ✓ Boot sync: owner resynced, ${synced} app(s) from config, orphans: ${orphans.length ? orphans.join(', ') : 'none'}`,
  );

  await seed(db);

  serve({ fetch: app.fetch, port: 3001 }, (info) => {
    console.log(`Auth service running at http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start auth service:', err);
  process.exit(1);
});
