import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import migrate from 'node-pg-migrate';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | null = null;

/**
 * Boots a single Postgres container shared by every test file in the run,
 * applies migrations, and exposes the connection URL to tests via
 * `inject('databaseUrl')` (wired through {@link ./setup.ts}).
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();

  await migrate({
    databaseUrl: url,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  project.provide('databaseUrl', url);
}

/** Stops the container after the test run finishes. */
export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }
}
