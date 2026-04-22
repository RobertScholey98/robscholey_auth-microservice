import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Hono } from 'hono';
import type { Env } from '@/index';
import type { PostgresDatabase, EventsBus } from '@/lib';
import type { StreamEvent } from '@robscholey/contracts';
import { resetDatabase } from '@/lib/__tests__/resetDatabase';
import { buildTestApp } from '@/lib/__tests__/buildTestApp';
import { _testResetRateLimit } from '@/middleware';

let app: Hono<Env>;
let db: PostgresDatabase;
let events: EventsBus;

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
  ({ app, database: db, events } = buildTestApp());
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await resetDatabase(db);
  _testResetRateLimit();
});

describe('GET /api/apps/:slug/meta', () => {
  it('returns metadata for an active app', async () => {
    await db.apps.create({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '/icons/portfolio.png',
      description: 'My portfolio',
      active: true,
      defaultTheme: 'dark',
      defaultAccent: 'warm',
    });

    const res = await app.request('/api/apps/portfolio/meta');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=600',
    );

    const body = await res.json();
    expect(body).toEqual({
      name: 'Portfolio',
      iconUrl: '/icons/portfolio.png',
      defaultTheme: 'dark',
      defaultAccent: 'warm',
    });
  });

  it('returns 404 for nonexistent app', async () => {
    const res = await app.request('/api/apps/nope/meta');
    expect(res.status).toBe(404);
  });

  it('returns 404 for inactive app', async () => {
    await db.apps.create({
      id: 'hidden',
      name: 'Hidden',
      url: 'https://hidden.vercel.app',
      iconUrl: '',
      description: '',
      active: false,
      defaultTheme: 'dark',
      defaultAccent: 'teal',
    });

    const res = await app.request('/api/apps/hidden/meta');
    expect(res.status).toBe(404);
  });

  it('does not require authentication', async () => {
    await db.apps.create({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
      defaultTheme: 'dark',
      defaultAccent: 'teal',
    });

    // No Authorization header
    const res = await app.request('/api/apps/portfolio/meta');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/app-icon/:slug', () => {
  it('returns an SVG placeholder icon for an active app', async () => {
    await db.apps.create({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
      defaultTheme: 'dark',
      defaultAccent: 'teal',
    });

    const res = await app.request('/api/app-icon/portfolio');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

    const body = await res.text();
    expect(body).toContain('<svg');
    expect(body).toContain('>P</text>');
  });

  it('returns 404 for nonexistent app', async () => {
    const res = await app.request('/api/app-icon/nope');
    expect(res.status).toBe(404);
  });

  it('returns 404 for inactive app', async () => {
    await db.apps.create({
      id: 'hidden',
      name: 'Hidden',
      url: 'https://hidden.vercel.app',
      iconUrl: '',
      description: '',
      active: false,
      defaultTheme: 'dark',
      defaultAccent: 'teal',
    });

    const res = await app.request('/api/app-icon/hidden');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/public/messages', () => {
  /** Helper — every public-message POST needs a JSON body and a stable caller IP. */
  function send(body: unknown, ip = '10.0.0.1') {
    return app.request('/api/public/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    });
  }

  it('creates a thread + message and returns both ids on 201', async () => {
    const res = await send({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi rob',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.threadId).toMatch(/^thr_/);
    expect(body.messageId).toMatch(/^msg_/);

    const thread = await db.threads.get(body.threadId);
    expect(thread?.contactEmail).toBe('alex@example.com');
    expect(thread?.unreadCount).toBe(1);
  });

  it('rejects a missing email with 400', async () => {
    const res = await send({ name: 'Alex', body: 'hi' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed email with 400', async () => {
    const res = await send({ name: 'Alex', email: 'not-an-email', body: 'hi' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty body with 400', async () => {
    const res = await send({ name: 'Alex', email: 'alex@example.com', body: '' });
    expect(res.status).toBe(400);
  });

  it('enforces the per-IP rate-limit after five successful sends', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await send({
        name: 'Alex',
        email: `alex${i}@example.com`,
        body: 'hi',
      });
      expect(ok.status).toBe(201);
    }
    const blocked = await send({
      name: 'Alex',
      email: 'alex5@example.com',
      body: 'hi',
    });
    expect(blocked.status).toBe(429);
  });

  it('emits a message-new event on the in-process bus', async () => {
    const received: StreamEvent[] = [];
    const unsubscribe = events.subscribe((event) => received.push(event));
    try {
      await send({ name: 'Alex', email: 'alex@example.com', body: 'hi rob' });
    } finally {
      unsubscribe();
    }

    const emitted = received.filter((e) => e.type === 'message-new');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: 'message-new',
      message: { direction: 'in', body: 'hi rob' },
      thread: { contactEmail: 'alex@example.com', unreadCount: 1 },
    });
  });
});
