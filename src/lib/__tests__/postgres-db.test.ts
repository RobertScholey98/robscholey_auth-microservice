import { describe, it, expect, beforeAll, beforeEach, afterAll, inject } from 'vitest';
import { PostgresDB } from '../postgres-db';
import type { App, User, AccessCode, Session, AccessLog } from '@/types';

let db: PostgresDB;

beforeAll(() => {
  db = new PostgresDB(inject('databaseUrl'));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db._testReset();
});

describe('PostgresDB — Apps', () => {
  const app: App = {
    id: 'portfolio',
    name: 'Portfolio',
    url: 'https://portfolio.vercel.app',
    iconUrl: '/icons/portfolio.png',
    description: 'My portfolio',
    active: true,
  };

  it('creates and retrieves an app', async () => {
    await db.createApp(app);
    expect(await db.getApp('portfolio')).toEqual(app);
    expect(await db.getApps()).toHaveLength(1);
  });

  it('returns null for nonexistent app', async () => {
    expect(await db.getApp('nope')).toBeNull();
  });

  it('updates an app', async () => {
    await db.createApp(app);
    const updated = await db.updateApp('portfolio', { name: 'My Portfolio' });
    expect(updated!.name).toBe('My Portfolio');
    expect(updated!.id).toBe('portfolio');
  });

  it('deletes an app', async () => {
    await db.createApp(app);
    expect(await db.deleteApp('portfolio')).toBe(true);
    expect(await db.getApp('portfolio')).toBeNull();
  });

  it('getAppMeta returns name and iconUrl for active apps', async () => {
    await db.createApp(app);
    expect(await db.getAppMeta('portfolio')).toEqual({
      name: 'Portfolio',
      iconUrl: '/icons/portfolio.png',
    });
  });

  it('getAppMeta returns null for inactive apps', async () => {
    await db.createApp({ ...app, active: false });
    expect(await db.getAppMeta('portfolio')).toBeNull();
  });

  it('getAppMeta returns null for nonexistent app', async () => {
    expect(await db.getAppMeta('nope')).toBeNull();
  });

  it('returns null when updating nonexistent app', async () => {
    expect(await db.updateApp('nope', { name: 'x' })).toBeNull();
  });
});

describe('PostgresDB — Users', () => {
  const user: User = {
    id: 'user-1',
    name: 'Rob',
    type: 'owner',
    username: 'rob',
    passwordHash: 'hashed',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  };

  it('creates and retrieves a user', async () => {
    await db.createUser(user);
    expect(await db.getUser('user-1')).toEqual(user);
  });

  it('finds user by username', async () => {
    await db.createUser(user);
    expect(await db.getUserByUsername('rob')).toEqual(user);
    expect(await db.getUserByUsername('nobody')).toBeNull();
  });

  it('stores users without a username', async () => {
    const anon: User = {
      id: 'user-2',
      name: 'Anon',
      type: 'anonymous',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };
    await db.createUser(anon);
    const stored = await db.getUser('user-2');
    expect(stored?.username).toBeUndefined();
    expect(stored?.passwordHash).toBeUndefined();
  });

  it('deletes a user', async () => {
    await db.createUser(user);
    expect(await db.deleteUser('user-1')).toBe(true);
    expect(await db.getUser('user-1')).toBeNull();
  });

  it('returns null when updating nonexistent user', async () => {
    expect(await db.updateUser('nope', { name: 'x' })).toBeNull();
  });
});

describe('PostgresDB — Access Codes', () => {
  const code: AccessCode = {
    code: 'XK7F2',
    userId: null,
    appIds: ['portfolio'],
    passwordHash: null,
    expiresAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    label: 'Test code',
  };

  it('creates and retrieves a code', async () => {
    await db.createCode(code);
    expect(await db.getCode('XK7F2')).toEqual(code);
  });

  it('filters codes by user', async () => {
    const userId = 'user-1';
    await db.createUser({
      id: userId,
      name: 'U',
      type: 'named',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    await db.createCode(code);
    await db.createCode({ ...code, code: 'ABC', userId });
    expect(await db.getCodesByUser(userId)).toHaveLength(1);
    expect(await db.getCodesByUser('nobody')).toHaveLength(0);
  });

  it('updates a code', async () => {
    await db.createCode(code);
    const updated = await db.updateCode('XK7F2', { label: 'Updated' });
    expect(updated!.label).toBe('Updated');
    expect(updated!.code).toBe('XK7F2');
  });

  it('returns null when updating nonexistent code', async () => {
    expect(await db.updateCode('NOPE', { label: 'x' })).toBeNull();
  });

  it('deletes a code', async () => {
    await db.createCode(code);
    expect(await db.deleteCode('XK7F2')).toBe(true);
    expect(await db.getCode('XK7F2')).toBeNull();
  });
});

describe('PostgresDB — Sessions', () => {
  const session: Session = {
    token: 'sess_abc',
    codeId: 'XK7F2',
    userId: null,
    appIds: ['portfolio'],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    lastActiveAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: new Date('2030-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    await db.createCode({
      code: 'XK7F2',
      userId: null,
      appIds: ['portfolio'],
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      label: 'Test code',
    });
  });

  it('creates and retrieves a session', async () => {
    await db.createSession(session);
    expect(await db.getSession('sess_abc')).toEqual(session);
  });

  it('filters sessions by code', async () => {
    await db.createSession(session);
    expect(await db.getSessionsByCode('XK7F2')).toHaveLength(1);
    expect(await db.getSessionsByCode('OTHER')).toHaveLength(0);
  });

  it('updates a session', async () => {
    await db.createSession(session);
    const updated = await db.updateSession('sess_abc', {
      lastActiveAt: new Date('2030-06-01T00:00:00Z'),
    });
    expect(updated!.lastActiveAt).toEqual(new Date('2030-06-01T00:00:00Z'));
    expect(updated!.token).toBe('sess_abc');
  });

  it('returns null when updating nonexistent session', async () => {
    expect(await db.updateSession('fake', { lastActiveAt: new Date() })).toBeNull();
  });

  it('deletes a session', async () => {
    await db.createSession(session);
    await db.deleteSession('sess_abc');
    expect(await db.getSession('sess_abc')).toBeNull();
  });

  it('returns null for nonexistent session', async () => {
    expect(await db.getSession('nope')).toBeNull();
  });
});

describe('PostgresDB — Access Logs', () => {
  const log: AccessLog = {
    id: 'log-1',
    sessionToken: 'sess_abc',
    codeId: 'XK7F2',
    appId: 'portfolio',
    accessedAt: new Date('2025-01-01T00:00:00Z'),
    userAgent: 'test',
  };

  it('logs and retrieves access entries', async () => {
    await db.logAccess(log);
    expect(await db.getAccessLogs({})).toHaveLength(1);
  });

  it('filters by codeId', async () => {
    await db.logAccess(log);
    expect(await db.getAccessLogs({ codeId: 'XK7F2' })).toHaveLength(1);
    expect(await db.getAccessLogs({ codeId: 'OTHER' })).toHaveLength(0);
  });

  it('filters by appId', async () => {
    await db.logAccess(log);
    expect(await db.getAccessLogs({ appId: 'portfolio' })).toHaveLength(1);
    expect(await db.getAccessLogs({ appId: 'other' })).toHaveLength(0);
  });
});
