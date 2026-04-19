import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCode } from '@robscholey/contracts';
import { InMemoryDatabase } from '@/lib/db';
import { createSessionsService, type SessionsService } from '../sessions.service';

/** One day in milliseconds — session expiry offsets in the tests below. */
const DAY_MS = 24 * 60 * 60 * 1000;

let db: InMemoryDatabase;
let service: SessionsService;

beforeEach(() => {
  db = new InMemoryDatabase();
  service = createSessionsService(db);
});

describe('sessions.service.validateActive', () => {
  const base = {
    codeId: null,
    userId: null,
    appIds: ['portfolio'],
    createdAt: new Date(),
    lastActiveAt: new Date(),
  };

  it('returns the session on the happy path', async () => {
    await db.sessions.create({
      token: 'sess_ok',
      ...base,
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    const session = await service.validateActive('sess_ok');
    expect(session.token).toBe('sess_ok');
  });

  it('throws UnauthorizedError when the session is expired', async () => {
    await db.sessions.create({
      token: 'sess_expired',
      ...base,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.validateActive('sess_expired')).rejects.toMatchObject({
      code: ErrorCode.AuthSessionExpired,
      status: 401,
    });
  });

  it('throws ForbiddenError when the appId is not in the session allowlist', async () => {
    await db.sessions.create({
      token: 'sess_scoped',
      ...base,
      appIds: ['portfolio'],
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    await expect(service.validateActive('sess_scoped', 'other-app')).rejects.toMatchObject({
      code: ErrorCode.LoggingAppNotPermitted,
      status: 403,
    });
  });

  it('throws UnauthorizedError for a missing session', async () => {
    await expect(service.validateActive('nope')).rejects.toMatchObject({
      code: ErrorCode.AuthSessionInvalid,
      status: 401,
    });
  });
});
