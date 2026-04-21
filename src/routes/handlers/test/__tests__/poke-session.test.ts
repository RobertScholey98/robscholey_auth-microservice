import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
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
let sessionToken: string;

beforeEach(async () => {
  await resetDatabase(db);
  _testResetRateLimit();
  await db.apps.create({
    id: 'portfolio',
    name: 'Portfolio',
    url: 'https://portfolio.vercel.app',
    iconUrl: '',
    description: '',
    active: true,
  });
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rob', password: 'test123' }),
  });
  const body = await res.json();
  ownerToken = body.jwt;
  sessionToken = body.sessionToken;
});

afterEach(() => {
  delete process.env.ENABLE_TEST_ENDPOINTS;
});

function authedPoke(body: object, options: { flag?: string | null } = {}) {
  // flag: string → set, null → unset, missing → set to '1' (default enabled).
  if (options.flag === null) {
    delete process.env.ENABLE_TEST_ENDPOINTS;
  } else {
    process.env.ENABLE_TEST_ENDPOINTS = options.flag ?? '1';
  }
  return app.request('/api/admin/test/poke-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/test/poke-session', () => {
  it('404s when ENABLE_TEST_ENDPOINTS is unset', async () => {
    const res = await authedPoke({ sessionToken, backdateMs: 60_000 }, { flag: null });
    expect(res.status).toBe(404);
  });

  it('404s when ENABLE_TEST_ENDPOINTS is set to something other than "1"', async () => {
    const res = await authedPoke({ sessionToken, backdateMs: 60_000 }, { flag: 'true' });
    expect(res.status).toBe(404);
  });

  it('backdates last_active_at when the flag is set', async () => {
    const res = await authedPoke({ sessionToken, backdateMs: 5 * 60_000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lastActiveAt).toBeTypeOf('string');

    const session = await db.sessions.get(sessionToken);
    expect(session).not.toBeNull();
    const age = Date.now() - session!.lastActiveAt.getTime();
    expect(age).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(age).toBeLessThan(5 * 60_000 + 5_000);
  });

  it('rejects unauthenticated requests even when the flag is set', async () => {
    process.env.ENABLE_TEST_ENDPOINTS = '1';
    const res = await app.request('/api/admin/test/poke-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, backdateMs: 60_000 }),
    });
    expect(res.status).toBe(401);
  });

  it('validates the request body', async () => {
    const res = await authedPoke({ sessionToken: '', backdateMs: 60_000 });
    expect(res.status).toBe(400);
  });

  it('returns lastActiveAt: null when the session does not exist', async () => {
    const res = await authedPoke({ sessionToken: 'sess_does-not-exist', backdateMs: 60_000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lastActiveAt).toBeNull();
  });
});
