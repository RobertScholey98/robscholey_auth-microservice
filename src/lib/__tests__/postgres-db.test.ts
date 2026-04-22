import { describe, it, expect, beforeAll, beforeEach, afterAll, inject } from 'vitest';
import { Pool } from 'pg';
import { PostgresDatabase } from '../db';
import { resetDatabase } from './resetDatabase';
import type { App, User, AccessCode, Session, AccessLog, Thread, Message } from '@/types';

let db: PostgresDatabase;

beforeAll(() => {
  db = new PostgresDatabase(new Pool({ connectionString: inject('databaseUrl') }));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await resetDatabase(db);
});

describe('PostgresDatabase — Apps', () => {
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

  it('getMeta returns name, iconUrl, and theming defaults for active apps', async () => {
    await db.apps.create(app);
    expect(await db.apps.getMeta('portfolio')).toEqual({
      name: 'Portfolio',
      iconUrl: '/icons/portfolio.png',
      defaultTheme: 'dark',
      defaultAccent: 'teal',
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

  it('updates selector metadata fields', async () => {
    await db.apps.create(app);
    const updated = await db.apps.update('portfolio', {
      version: '0.4.0',
      lastUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
      statusVariant: 'dev',
      visualKey: 'ascii',
    });
    expect(updated!.version).toBe('0.4.0');
    expect(updated!.lastUpdatedAt).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    expect(updated!.statusVariant).toBe('dev');
    expect(updated!.visualKey).toBe('ascii');
  });
});

describe('PostgresDatabase — Users', () => {
  const user: User = {
    id: 'user-1',
    name: 'Rob',
    type: 'owner',
    username: 'rob',
    passwordHash: 'hashed',
    createdAt: new Date('2025-01-01T00:00:00Z'),
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

  it('stores users without a username', async () => {
    const anon: User = {
      id: 'user-2',
      name: 'Anon',
      type: 'anonymous',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };
    await db.users.create(anon);
    const stored = await db.users.get('user-2');
    expect(stored?.username).toBeUndefined();
    expect(stored?.passwordHash).toBeUndefined();
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

describe('PostgresDatabase — Access Codes', () => {
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
    await db.codes.create(code);
    expect(await db.codes.get('XK7F2')).toEqual(code);
  });

  it('filters codes by user', async () => {
    const userId = 'user-1';
    await db.users.create({
      id: userId,
      name: 'U',
      type: 'named',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    await db.codes.create(code);
    await db.codes.create({ ...code, code: 'ABC', userId });
    expect(await db.codes.getByUser(userId)).toHaveLength(1);
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

describe('PostgresDatabase — Sessions', () => {
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
    await db.codes.create({
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
      lastActiveAt: new Date('2030-06-01T00:00:00Z'),
    });
    expect(updated!.lastActiveAt).toEqual(new Date('2030-06-01T00:00:00Z'));
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

describe('PostgresDatabase — Access Logs', () => {
  const log: AccessLog = {
    id: 'log-1',
    sessionToken: 'sess_abc',
    codeId: 'XK7F2',
    appId: 'portfolio',
    accessedAt: new Date('2025-01-01T00:00:00Z'),
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

describe('PostgresDatabase — Threads', () => {
  const thread: Thread = {
    id: 'thr_1',
    contactEmail: 'alex@example.com',
    contactName: 'Alex',
    unreadCount: 1,
    lastMessageAt: new Date('2026-04-20T10:00:00Z'),
    lastMessagePreview: 'hi rob',
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
      lastMessagePreview: 'replied',
      lastMessageDirection: 'out',
    });
    expect(updated?.unreadCount).toBe(0);
    expect(updated?.lastMessagePreview).toBe('replied');
    expect(updated?.lastMessageDirection).toBe('out');
  });

  it('returns null when updating nonexistent thread', async () => {
    expect(await db.threads.update('nope', { unreadCount: 0 })).toBeNull();
  });

  it('rejects duplicate contact emails', async () => {
    await db.threads.create(thread);
    await expect(
      db.threads.create({ ...thread, id: 'thr_2' }),
    ).rejects.toThrow();
  });

  it('deletes a thread and cascades to its messages', async () => {
    await db.threads.create(thread);
    await db.messages.create({
      id: 'msg_1',
      threadId: 'thr_1',
      direction: 'in',
      body: 'hi',
      sessionToken: null,
      codeId: null,
      createdAt: new Date('2026-04-20T10:00:00Z'),
    });
    expect(await db.threads.delete('thr_1')).toBe(true);
    expect(await db.messages.listByThread('thr_1')).toHaveLength(0);
  });
});

describe('PostgresDatabase — Messages', () => {
  const thread: Thread = {
    id: 'thr_1',
    contactEmail: 'alex@example.com',
    contactName: 'Alex',
    unreadCount: 0,
    lastMessageAt: new Date('2026-04-20T10:00:00Z'),
    lastMessagePreview: '',
    lastMessageDirection: 'in',
    createdAt: new Date('2026-04-20T10:00:00Z'),
  };

  beforeEach(async () => {
    await db.threads.create(thread);
  });

  const inboundMessage: Message = {
    id: 'msg_1',
    threadId: 'thr_1',
    direction: 'in',
    body: 'hi Rob',
    sessionToken: null,
    codeId: null,
    createdAt: new Date('2026-04-20T10:00:00Z'),
  };

  it('creates and lists a message', async () => {
    await db.messages.create(inboundMessage);
    const list = await db.messages.listByThread('thr_1');
    expect(list).toEqual([inboundMessage]);
  });

  it('lists messages in chronological order', async () => {
    await db.messages.create({
      ...inboundMessage,
      id: 'msg_2',
      body: 'second',
      createdAt: new Date('2026-04-20T10:05:00Z'),
    });
    await db.messages.create(inboundMessage);
    const list = await db.messages.listByThread('thr_1');
    expect(list.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
  });

  it('isolates messages by thread', async () => {
    await db.threads.create({
      ...thread,
      id: 'thr_2',
      contactEmail: 'bea@example.com',
    });
    await db.messages.create(inboundMessage);
    await db.messages.create({ ...inboundMessage, id: 'msg_2', threadId: 'thr_2' });
    expect(await db.messages.listByThread('thr_1')).toHaveLength(1);
    expect(await db.messages.listByThread('thr_2')).toHaveLength(1);
  });
});
