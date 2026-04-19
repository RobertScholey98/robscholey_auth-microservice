import type { DB } from './db';
import { hashPassword } from './password';

/**
 * Ensures exactly one owner user exists in the DB, matching `ADMIN_USERNAME` /
 * `ADMIN_PASSWORD` from the environment. Runs on every boot — rotating the
 * owner password is therefore just an env edit + restart.
 *
 * - If no owner exists → creates one.
 * - If an owner exists → updates its username + password hash to match env.
 *
 * Throws if the env vars are unset.
 */
export async function syncOwner(db: DB): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'ADMIN_USERNAME and ADMIN_PASSWORD are required. Set them in .env before starting auth.',
    );
  }

  const users = await db.getUsers();
  const existing = users.find((u) => u.type === 'owner');
  const passwordHash = await hashPassword(password);

  if (existing) {
    await db.updateUser(existing.id, {
      name: username,
      username,
      passwordHash,
    });
  } else {
    await db.createUser({
      id: crypto.randomUUID(),
      name: username,
      type: 'owner',
      username,
      passwordHash,
      createdAt: new Date(),
    });
  }
}
