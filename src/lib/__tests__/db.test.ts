import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDatabase } from '../db';
import type { App, User, AccessCode, Session, AccessLog, Thread, Message } from '@/types';

let db: InMemoryDatabase;

beforeEach(() => {
  db = new InMemoryDatabase();
});

describe('InMemoryDatabase — Apps', () => {
  const app: App = {
    id: 'portfolio',
    name: 'Portfolio',
    url: 'https://portfolio.vercel.app',
    iconUrl: '/icons/portfolio.png',
    description: 'My portfolio',
    active: true,
    defaultTheme: 'dark',
    defaultAccent: 'teal',
  };

  it('creates and retrieves an app', async () => {
    await db.apps.create(app);
    expect(await db.apps.get('portfolio')).toEqual(app);
    expect(await db.apps.list()).toHaveLength(1);
  });

  it('returns null for nonexistent app', async () => {
    expect(await db.apps.get('nope')).toBeNull();
  });

  it('updates an app', async () => {
    await db.apps.create(app);
    const updated = await db.apps.update('portfolio', { name: 'My Portfolio' });
    expect(updated!.name).toBe('My Portfolio');
    expect(updated!.id).toBe('portfolio');
  });

  it('deletes an app', async () => {
    await db.apps.create(app);
    expect(await db.apps.delete('portfolio')).toBe(true);
    expect(await db.apps.get('portfolio')).toBeNull();
  });

  it('getMeta returns name and iconUrl for active apps', async () => {
    await db.apps.create(app);
    expect(await db.apps.getMeta('portfolio')).toEqual({
      name: 'Portfolio',
      iconUrl: '/icons/portfolio.png',
    });
  });

  it('getMeta returns null for inactive apps', async () => {
    await db.apps.create({ ...app, active: false });
    expect(await db.apps.getMeta('portfolio')).toBeNull();
  });

  it('getMeta returns null for nonexistent app', async () => {
    expect(await db.apps.getMeta('nope')).toBeNull();
  });

  it('returns null when updating nonexistent app', async () => {
    expect(await db.apps.update('nope', { name: 'x' })).toBeNull();
  });

  it('round-trips selector metadata fields', async () => {
    const withMetadata: App = {
      ...app,
      version: '0.3.0',
      lastUpdatedAt: new Date('2026-04-18T00:00:00.000Z'),
      statusVariant: 'live',
      visualKey: 'bars',
    };
    await db.apps.create(withMetadata);
    expect(await db.apps.get('portfolio')).toEqual(withMetadata);
  });
});

describe('InMemoryDatabase — Users', () => {
  const user: User = {
    id: 'user-1',
    name: 'Rob',
    type: 'owner',
    username: 'rob',
    passwordHash: 'hashed',
    createdAt: new Date(),
  };

  it('creates and retrieves a user', async () => {
    await db.users.create(user);
    expect(await db.users.get('user-1')).toEqual(user);
  });

  it('finds user by username', async () => {
    await db.users.create(user);
    expect(await db.users.getByUsername('rob')).toEqual(user);
    expect(await db.users.getByUsername('nobody')).toBeNull();
  });

  it('deletes a user', async () => {
    await db.users.create(user);
    expect(await db.users.delete('user-1')).toBe(true);
    expect(await db.users.get('user-1')).toBeNull();
  });

  it('returns null when updating nonexistent user', async () => {
    expect(await db.users.update('nope', { name: 'x' })).toBeNull();
  });
});

describe('InMemoryDatabase — Access Codes', () => {
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
    await db.codes.create(code);
    expect(await db.codes.get('XK7F2')).toEqual(code);
  });

  it('filters codes by user', async () => {
    await db.codes.create(code);
    await db.codes.create({ ...code, code: 'ABC', userId: 'user-1' });
    expect(await db.codes.getByUser('user-1')).toHaveLength(1);
    expect(await db.codes.getByUser('nobody')).toHaveLength(0);
  });

  it('updates a code', async () => {
    await db.codes.create(code);
    const updated = await db.codes.update('XK7F2', { label: 'Updated' });
    expect(updated!.label).toBe('Updated');
    expect(updated!.code).toBe('XK7F2');
  });

  it('returns null when updating nonexistent code', async () => {
    expect(await db.codes.update('NOPE', { label: 'x' })).toBeNull();
  });

  it('deletes a code', async () => {
    await db.codes.create(code);
    expect(await db.codes.delete('XK7F2')).toBe(true);
    expect(await db.codes.get('XK7F2')).toBeNull();
  });
});

describe('InMemoryDatabase — Sessions', () => {
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
    await db.sessions.create(session);
    expect(await db.sessions.get('sess_abc')).toEqual(session);
  });

  it('filters sessions by code', async () => {
    await db.sessions.create(session);
    expect(await db.sessions.getByCode('XK7F2')).toHaveLength(1);
    expect(await db.sessions.getByCode('OTHER')).toHaveLength(0);
  });

  it('updates a session', async () => {
    await db.sessions.create(session);
    const updated = await db.sessions.update('sess_abc', {
      lastActiveAt: new Date('2030-01-01'),
    });
    expect(updated!.lastActiveAt).toEqual(new Date('2030-01-01'));
    expect(updated!.token).toBe('sess_abc');
  });

  it('returns null when updating nonexistent session', async () => {
    expect(await db.sessions.update('fake', { lastActiveAt: new Date() })).toBeNull();
  });

  it('deletes a session', async () => {
    await db.sessions.create(session);
    await db.sessions.delete('sess_abc');
    expect(await db.sessions.get('sess_abc')).toBeNull();
  });

  it('returns null for nonexistent session', async () => {
    expect(await db.sessions.get('nope')).toBeNull();
  });
});

describe('InMemoryDatabase — Access Logs', () => {
  const log: AccessLog = {
    id: 'log-1',
    sessionToken: 'sess_abc',
    codeId: 'XK7F2',
    appId: 'portfolio',
    accessedAt: new Date(),
    userAgent: 'test',
  };

  it('logs and retrieves access entries', async () => {
    await db.accessLogs.append(log);
    expect(await db.accessLogs.query({})).toHaveLength(1);
  });

  it('filters by codeId', async () => {
    await db.accessLogs.append(log);
    expect(await db.accessLogs.query({ codeId: 'XK7F2' })).toHaveLength(1);
    expect(await db.accessLogs.query({ codeId: 'OTHER' })).toHaveLength(0);
  });

  it('filters by appId', async () => {
    await db.accessLogs.append(log);
    expect(await db.accessLogs.query({ appId: 'portfolio' })).toHaveLength(1);
    expect(await db.accessLogs.query({ appId: 'other' })).toHaveLength(0);
  });
});

describe('InMemoryDatabase — Threads', () => {
  const thread: Thread = {
    id: 'thr_1',
    contactEmail: 'alex@example.com',
    contactName: 'Alex',
    unreadCount: 1,
    lastMessageAt: new Date('2026-04-20T10:00:00Z'),
    lastMessagePreview: 'hi',
    lastMessageDirection: 'in',
    createdAt: new Date('2026-04-20T10:00:00Z'),
  };

  it('creates and retrieves a thread by id', async () => {
    await db.threads.create(thread);
    expect(await db.threads.get('thr_1')).toEqual(thread);
  });

  it('retrieves a thread by contact email', async () => {
    await db.threads.create(thread);
    expect(await db.threads.getByEmail('alex@example.com')).toEqual(thread);
    expect(await db.threads.getByEmail('nobody@example.com')).toBeNull();
  });

  it('lists threads most-recent-first', async () => {
    await db.threads.create(thread);
    await db.threads.create({
      ...thread,
      id: 'thr_2',
      contactEmail: 'bea@example.com',
      lastMessageAt: new Date('2026-04-21T10:00:00Z'),
    });
    const list = await db.threads.list();
    expect(list.map((t) => t.id)).toEqual(['thr_2', 'thr_1']);
  });

  it('updates denormalised fields and unread count', async () => {
    await db.threads.create(thread);
    const updated = await db.threads.update('thr_1', {
      unreadCount: 0,
      lastMessageDirection: 'out',
    });
    expect(updated?.unreadCount).toBe(0);
    expect(updated?.lastMessageDirection).toBe('out');
  });
});

describe('InMemoryDatabase — Messages', () => {
  const message: Message = {
    id: 'msg_1',
    threadId: 'thr_1',
    direction: 'in',
    body: 'hi Rob',
    sessionToken: null,
    codeId: null,
    createdAt: new Date('2026-04-20T10:00:00Z'),
  };

  it('creates and lists messages', async () => {
    await db.messages.create(message);
    expect(await db.messages.listByThread('thr_1')).toEqual([message]);
  });

  it('sorts messages chronologically', async () => {
    await db.messages.create({
      ...message,
      id: 'msg_2',
      createdAt: new Date('2026-04-20T10:05:00Z'),
    });
    await db.messages.create(message);
    const list = await db.messages.listByThread('thr_1');
    expect(list.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
  });
});
