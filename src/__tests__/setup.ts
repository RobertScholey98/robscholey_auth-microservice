import { inject } from 'vitest';

// Propagates the DATABASE_URL provided by globalSetup to each worker's
// process.env so module-level singletons (src/lib/index.ts) see it at import.
process.env.DATABASE_URL = inject('databaseUrl');
