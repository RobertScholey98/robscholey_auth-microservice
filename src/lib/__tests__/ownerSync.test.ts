import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryDB } from '../db';
import { comparePassword } from '../password';
import { syncOwner } from '../ownerSync';

let db: InMemoryDB;
const originalEnv = { user: process.env.ADMIN_USERNAME, pass: process.env.ADMIN_PASSWORD };

beforeEach(() => {
  db = new InMemoryDB();
  process.env.ADMIN_USERNAME = 'rob';
  process.env.ADMIN_PASSWORD = 'hunter2';
});

afterEach(() => {
  if (originalEnv.user === undefined) delete process.env.ADMIN_USERNAME;
  else process.env.ADMIN_USERNAME = originalEnv.user;
  if (originalEnv.pass === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalEnv.pass;
});

describe('syncOwner', () => {
  it('creates an owner on an empty DB', async () => {
    await syncOwner(db);
    const users = await db.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].type).toBe('owner');
    expect(users[0].username).toBe('rob');
    expect(await comparePassword('hunter2', users[0].passwordHash!)).toBe(true);
  });

  it('updates the existing owner on repeat sync', async () => {
    await syncOwner(db);
    const [before] = await db.getUsers();

    process.env.ADMIN_USERNAME = 'rob2';
    process.env.ADMIN_PASSWORD = 'newpass';
    await syncOwner(db);

    const users = await db.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(before.id);
    expect(users[0].username).toBe('rob2');
    expect(await comparePassword('newpass', users[0].passwordHash!)).toBe(true);
  });

  it('throws when ADMIN_USERNAME is missing', async () => {
    delete process.env.ADMIN_USERNAME;
    await expect(syncOwner(db)).rejects.toThrow(/ADMIN_USERNAME/);
  });

  it('throws when ADMIN_PASSWORD is missing', async () => {
    delete process.env.ADMIN_PASSWORD;
    await expect(syncOwner(db)).rejects.toThrow(/ADMIN_PASSWORD/);
  });

  it('leaves non-owner users untouched', async () => {
    await db.createUser({
      id: 'other',
      name: 'Other',
      type: 'named',
      createdAt: new Date(),
    });

    await syncOwner(db);

    const users = await db.getUsers();
    expect(users).toHaveLength(2);
    expect(users.find((u) => u.id === 'other')).toBeDefined();
    expect(users.find((u) => u.type === 'owner')).toBeDefined();
  });
});
