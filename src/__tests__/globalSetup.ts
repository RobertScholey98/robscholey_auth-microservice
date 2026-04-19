import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import migrate from 'node-pg-migrate';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    appsConfigPath: string;
  }
}

let container: StartedPostgreSqlContainer | null = null;
let fixtureDir: string | null = null;

/**
 * Test-run fixture config. Admin app tests reference `'in-config'` as an id
 * that should be gated against deletion, and rely on other ids being treated
 * as orphans.
 */
const testAppsConfig = {
  apps: [
    {
      id: 'in-config',
      name: 'In Config',
      url: 'http://localhost:3999',
      iconUrl: '',
      description: 'Fixture app present in appsConfig.json',
    },
  ],
};

/**
 * Boots a single Postgres container shared by every test file in the run,
 * applies migrations, writes an appsConfig fixture, and exposes the DB URL
 * and config path to tests via `inject(...)` (wired through {@link ./setup.ts}).
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

  fixtureDir = await mkdtemp(join(tmpdir(), 'auth-test-apps-config-'));
  const fixturePath = join(fixtureDir, 'appsConfig.json');
  await writeFile(fixturePath, JSON.stringify(testAppsConfig), 'utf8');

  project.provide('databaseUrl', url);
  project.provide('appsConfigPath', fixturePath);
}

/** Stops the container and deletes the fixture after the test run finishes. */
export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }
  if (fixtureDir) {
    await rm(fixtureDir, { recursive: true, force: true });
    fixtureDir = null;
  }
}
