import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCode } from '@robscholey/contracts';
import { InMemoryDatabase } from '@/lib/db';
import { createCodesService, type CodesService } from '../codes.service';

/** One day in milliseconds — session expiry offsets in the tests below. */
const DAY_MS = 24 * 60 * 60 * 1000;

let db: InMemoryDatabase;
let service: CodesService;

beforeEach(() => {
  db = new InMemoryDatabase();
  service = createCodesService(db);
});

describe('codes.service.create', () => {
  it('creates a named user inline when userName is supplied', async () => {
    const created = await service.create({
      userName: 'Sarah',
      appIds: ['portfolio'],
    });

    expect(created.userId).not.toBeNull();
    const user = await db.users.get(created.userId!);
    expect(user?.name).toBe('Sarah');
    expect(user?.type).toBe('named');
  });

  it('throws ConflictError on a duplicate code string', async () => {
    await service.create({ code: 'DUP', appIds: ['portfolio'] });
    await expect(
      service.create({ code: 'DUP', appIds: ['portfolio'] }),
    ).rejects.toMatchObject({ code: ErrorCode.AdminCodeConflict, status: 409 });
  });

  it('throws NotFound when userId is supplied but does not exist', async () => {
    await expect(
      service.create({ userId: 'nope', appIds: ['portfolio'] }),
    ).rejects.toMatchObject({ code: ErrorCode.AdminUserNotFound, status: 404 });
  });
});

describe('codes.service.delete', () => {
  it('cascades to every session created from the code', async () => {
    await service.create({ code: 'ABC', appIds: ['portfolio'] });

    await db.sessions.create({
      token: 'sess_1',
      codeId: 'ABC',
      userId: null,
      appIds: ['portfolio'],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    await db.sessions.create({
      token: 'sess_2',
      codeId: 'ABC',
      userId: null,
      appIds: ['portfolio'],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    await service.delete('ABC');

    expect(await db.codes.get('ABC')).toBeNull();
    expect(await db.sessions.get('sess_1')).toBeNull();
    expect(await db.sessions.get('sess_2')).toBeNull();
  });

  it('throws NotFound for an unknown code', async () => {
    await expect(service.delete('NOPE')).rejects.toMatchObject({
      code: ErrorCode.AdminCodeNotFound,
      status: 404,
    });
  });
});
