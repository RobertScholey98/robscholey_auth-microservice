import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import type { Hono } from 'hono';
import type { Env } from '@/index';
import type { PostgresDatabase } from '@/lib';
import { resetDatabase } from '@/lib/__tests__/resetDatabase';
import { buildTestApp } from '@/lib/__tests__/buildTestApp';

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

beforeEach(async () => {
  await resetDatabase(db);
});

afterEach(() => {
  delete process.env.ENABLE_TEST_ENDPOINTS;
});

/** Fires six rapid login attempts and returns the last status. */
async function fillBucket(): Promise<number> {
  let last = 0;
  for (let i = 0; i < 6; i++) {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.42' },
      body: JSON.stringify({ username: 'rob', password: 'wrong-password' }),
    });
    last = res.status;
  }
  return last;
}

describe('POST /api/test/reset-rate-limit', () => {
  it('404s when ENABLE_TEST_ENDPOINTS is unset', async () => {
    const res = await app.request('/api/test/reset-rate-limit', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('clears the rate-limit bucket when the flag is set', async () => {
    process.env.ENABLE_TEST_ENDPOINTS = '1';

    // Burn the bucket first — sixth request should be 429.
    const blocked = await fillBucket();
    expect(blocked).toBe(429);

    // Reset → next /auth/login from the same IP should be allowed again.
    const reset = await app.request('/api/test/reset-rate-limit', { method: 'POST' });
    expect(reset.status).toBe(200);

    const retry = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.42' },
      body: JSON.stringify({ username: 'rob', password: 'wrong-password' }),
    });
    expect(retry.status).not.toBe(429);
  });
});
