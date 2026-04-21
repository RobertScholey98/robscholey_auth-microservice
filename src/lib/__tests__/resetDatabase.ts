import { InMemoryDatabase, PostgresDatabase, type Database } from '@/lib/db';

/**
 * Clears every row from the given {@link Database}. Test-only — this lives in
 * `__tests__/` on purpose so production code, which depends on `Database`, never
 * sees a `reset()` method on the type it imports.
 *
 * For {@link InMemoryDatabase} the call is synchronous in practice; for
 * {@link PostgresDatabase} it issues a single cross-table `TRUNCATE ... CASCADE`
 * so tests get a clean slate between runs without re-running migrations.
 *
 * @param db - The database to reset.
 * @throws If `db` is not an instance of a known concrete {@link Database}.
 */
export async function resetDatabase(db: Database): Promise<void> {
  if (db instanceof InMemoryDatabase) {
    db.apps._reset();
    db.users._reset();
    db.codes._reset();
    db.sessions._reset();
    db.accessLogs._reset();
    db.threads._reset();
    db.messages._reset();
    return;
  }
  if (db instanceof PostgresDatabase) {
    await db.pool.query(
      'TRUNCATE messages, threads, access_logs, sessions, access_codes, users, apps RESTART IDENTITY CASCADE',
    );
    return;
  }
  throw new Error('resetDatabase: unsupported Database implementation');
}
