import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDB } from '../db';
import type { App, User, AccessCode, Session, AccessLog } from '@/types';

let db: InMemoryDB;

beforeEach(() => {
  db = new InMemoryDB();
});

describe('InMemoryDB — Apps', () => {
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

describe('InMemoryDB — Users', () => {
  const user: User = {
    id: 'user-1',
    name: 'Rob',
    type: 'owner',
    username: 'rob',
    passwordHash: 'hashed',
    createdAt: new Date(),
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

  it('deletes a user', async () => {
    await db.createUser(user);
    expect(await db.deleteUser('user-1')).toBe(true);
    expect(await db.getUser('user-1')).toBeNull();
  });

  it('returns null when updating nonexistent user', async () => {
    expect(await db.updateUser('nope', { name: 'x' })).toBeNull();
  });
});

describe('InMemoryDB — Access Codes', () => {
  const code: AccessCode = {
    code: 'XK7F2',
    userId: null,
    appIds: ['portfolio'],
    passwordHash: null,
    expiresAt: null,
    createdAt: new Date(),
    label: 'Test code',
  };

  it('creates and retrieves a code', async () => {
    await db.createCode(code);
    expect(await db.getCode('XK7F2')).toEqual(code);
  });

  it('filters codes by user', async () => {
    await db.createCode(code);
    await db.createCode({ ...code, code: 'ABC', userId: 'user-1' });
    expect(await db.getCodesByUser('user-1')).toHaveLength(1);
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

describe('InMemoryDB — Sessions', () => {
  const session: Session = {
    token: 'sess_abc',
    codeId: 'XK7F2',
    userId: null,
    appIds: ['portfolio'],
    createdAt: new Date(),
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  };

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
      lastActiveAt: new Date('2030-01-01'),
    });
    expect(updated!.lastActiveAt).toEqual(new Date('2030-01-01'));
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

describe('InMemoryDB — Access Logs', () => {
  const log: AccessLog = {
    id: 'log-1',
    sessionToken: 'sess_abc',
    codeId: 'XK7F2',
    appId: 'portfolio',
    accessedAt: new Date(),
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
