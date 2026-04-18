import { serve } from '@hono/node-server';
import migrate from 'node-pg-migrate';
import app from './index';
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

  serve({ fetch: app.fetch, port: 3001 }, async (info) => {
    console.log(`Auth service running at http://localhost:${info.port}`);
    await seed();
  });
}

main().catch((err) => {
  console.error('Failed to start auth service:', err);
  process.exit(1);
});
