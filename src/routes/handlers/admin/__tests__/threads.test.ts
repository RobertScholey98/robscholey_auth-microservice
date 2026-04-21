import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Hono } from 'hono';
import type { Env } from '@/index';
import type { PostgresDatabase } from '@/lib';
import { resetDatabase } from '@/lib/__tests__/resetDatabase';
import { buildTestApp } from '@/lib/__tests__/buildTestApp';
import { _testResetRateLimit } from '@/middleware';

let app: Hono<Env>;
let db: PostgresDatabase;

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
  ({ app, database: db } = buildTestApp());
});

afterAll(async () => {
  await db.close();
});

let ownerToken: string;

beforeEach(async () => {
  await resetDatabase(db);
  _testResetRateLimit();

  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rob', password: 'test123' }),
  });
  ownerToken = (await res.json()).jwt;
});

function adminFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${ownerToken}`);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...init, headers });
}

/** Seeds one thread by round-tripping a public send; the service handles the denorms. */
async function seedThread(body = 'hi rob') {
  const res = await app.request('/api/public/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alex', email: 'alex@example.com', body }),
  });
  return (await res.json()) as { threadId: string; messageId: string };
}

describe('GET /api/admin/threads', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.request('/api/admin/threads', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('returns an empty list when there are no threads', async () => {
    const res = await adminFetch('/api/admin/threads');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists threads most-recent-activity first', async () => {
    const first = await seedThread('first');
    const second = await seedThread('second');
    // Second landed after first, and shares the same email → same thread.
    expect(second.threadId).toBe(first.threadId);

    const res = await adminFetch('/api/admin/threads');
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].contactEmail).toBe('alex@example.com');
    expect(body[0].lastMessagePreview).toBe('second');
    expect(body[0].unreadCount).toBe(2);
  });
});

describe('GET /api/admin/threads/:id', () => {
  it('returns the thread + messages in chronological order', async () => {
    const { threadId } = await seedThread('first');

    const res = await adminFetch(`/api/admin/threads/${threadId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thread.id).toBe(threadId);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].direction).toBe('in');
    expect(body.messages[0].body).toBe('first');
  });

  it('404s for an unknown thread', async () => {
    const res = await adminFetch('/api/admin/threads/thr_missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/threads/:id/messages', () => {
  it('appends an outbound reply', async () => {
    const { threadId } = await seedThread();

    const res = await adminFetch(`/api/admin/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'thanks!' }),
    });
    expect(res.status).toBe(201);

    const detail = await adminFetch(`/api/admin/threads/${threadId}`);
    const body = await detail.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].direction).toBe('out');
    expect(body.messages[1].body).toBe('thanks!');
  });

  it('rejects an empty reply body with 400', async () => {
    const { threadId } = await seedThread();
    const res = await adminFetch(`/api/admin/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s when replying to an unknown thread', async () => {
    const res = await adminFetch('/api/admin/threads/thr_missing/messages', {
      method: 'POST',
      body: JSON.stringify({ body: 'hi' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/threads/:id/read', () => {
  it('zeroes unreadCount on the thread', async () => {
    const { threadId } = await seedThread();
    // unreadCount is 1 after seeding.
    const before = await adminFetch(`/api/admin/threads/${threadId}`);
    expect((await before.json()).thread.unreadCount).toBe(1);

    const res = await adminFetch(`/api/admin/threads/${threadId}/read`, { method: 'POST' });
    expect(res.status).toBe(200);

    const after = await adminFetch(`/api/admin/threads/${threadId}`);
    expect((await after.json()).thread.unreadCount).toBe(0);
  });
});
