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
});

function adminGet(path: string) {
  return app.request(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
}

describe('GET /api/admin/presence', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.request('/api/admin/presence', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('returns the owner session in live (just created by /auth/setup)', async () => {
    const res = await adminGet('/api/admin/presence');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.live).toHaveLength(1);
    expect(body.idle).toEqual([]);
    expect(body.live[0]).toMatchObject({
      status: 'live',
      appIds: ['portfolio'],
    });
    expect(body.live[0].sessionToken).toBeTypeOf('string');
  });
});
