import { inject } from 'vitest';

// Propagates the DATABASE_URL provided by globalSetup to each worker's
// process.env so handler-test setup code (buildTestApp) and the appsConfig
// loader can read it via the standard environment.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APPS_CONFIG_PATH = inject('appsConfigPath');
