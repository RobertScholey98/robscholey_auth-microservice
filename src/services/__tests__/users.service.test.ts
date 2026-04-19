import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCode } from '@robscholey/contracts';
import { InMemoryDatabase } from '@/lib/db';
import { comparePassword } from '@/lib';
import { createUsersService, type UsersService } from '../users.service';

/** One day in milliseconds — session expiry offsets in the tests below. */
const DAY_MS = 24 * 60 * 60 * 1000;

let db: InMemoryDatabase;
let service: UsersService;

beforeEach(() => {
  db = new InMemoryDatabase();
  service = createUsersService(db);
});

describe('users.service.ensureOwner', () => {
  it('creates an owner on an empty DB', async () => {
    await service.ensureOwner('rob', 'hunter2');
    const users = await db.users.list();
    expect(users).toHaveLength(1);
    expect(users[0].type).toBe('owner');
    expect(users[0].username).toBe('rob');
    expect(await comparePassword('hunter2', users[0].passwordHash!)).toBe(true);
  });

  it('updates the existing owner on repeat call', async () => {
    await service.ensureOwner('rob', 'hunter2');
    const [before] = await db.users.list();

    await service.ensureOwner('rob2', 'newpass');

    const users = await db.users.list();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(before.id);
    expect(users[0].username).toBe('rob2');
    expect(await comparePassword('newpass', users[0].passwordHash!)).toBe(true);
  });

  it('leaves non-owner users untouched', async () => {
    await db.users.create({
      id: 'other',
      name: 'Other',
      type: 'named',
      createdAt: new Date(),
    });

    await service.ensureOwner('rob', 'hunter2');

    const users = await db.users.list();
    expect(users).toHaveLength(2);
    expect(users.find((u) => u.id === 'other')).toBeDefined();
    expect(users.find((u) => u.type === 'owner')).toBeDefined();
  });
});

describe('users.service.delete', () => {
  it('cascades to direct sessions, owned codes, and per-code sessions', async () => {
    const userId = 'user-1';
    await db.users.create({
      id: userId,
      name: 'Sarah',
      type: 'named',
      createdAt: new Date(),
    });

    // Direct session (e.g. an owner login with codeId: null, but applied to a named user for the test).
    await db.sessions.create({
      token: 'sess_direct',
      codeId: null,
      userId,
      appIds: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    // Owned code + session created from that code.
    await db.codes.create({
      code: 'SARAH',
      userId,
      appIds: ['portfolio'],
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(),
      label: 'Sarah access',
    });
    await db.sessions.create({
      token: 'sess_from_code',
      codeId: 'SARAH',
      userId,
      appIds: ['portfolio'],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    await service.delete(userId);

    expect(await db.users.get(userId)).toBeNull();
    expect(await db.sessions.get('sess_direct')).toBeNull();
    expect(await db.codes.get('SARAH')).toBeNull();
    expect(await db.sessions.get('sess_from_code')).toBeNull();
  });

  it('throws NotFound for an unknown user', async () => {
    await expect(service.delete('nope')).rejects.toMatchObject({
      code: ErrorCode.AdminUserNotFound,
      status: 404,
    });
  });
});
