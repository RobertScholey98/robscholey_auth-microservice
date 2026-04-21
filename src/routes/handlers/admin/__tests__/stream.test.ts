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
  const body = await res.json();
  ownerToken = body.jwt;
});

/**
 * Opens the stream and returns the response headers, then aborts. Doesn&rsquo;t
 * try to read bytes — the long-lived SSE body would otherwise hang the
 * test until the 25s heartbeat fires (or forever, since we emit no events
 * in this scaffold).
 */
async function openStream(request: Request): Promise<Response> {
  const controller = new AbortController();
  const requestWithSignal = new Request(request, { signal: controller.signal });
  const response = await app.fetch(requestWithSignal);
  // Cancel the body immediately — streamSSE&rsquo;s onAbort hook fires and
  // cleans up the subscription + heartbeat timer on the server side.
  if (response.body) {
    await response.body.cancel().catch(() => {});
  }
  controller.abort();
  return response;
}

describe('GET /api/admin/stream', () => {
  it('rejects requests with no token', async () => {
    const res = await app.request('/api/admin/stream', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('rejects requests with a malformed query token', async () => {
    const res = await app.request('/api/admin/stream?token=not-a-jwt', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });

  it('accepts the admin JWT on the query string and returns text/event-stream', async () => {
    const req = new Request(`http://localhost/api/admin/stream?token=${ownerToken}`, {
      method: 'GET',
    });
    const response = await openStream(req);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')?.toLowerCase()).toContain('text/event-stream');
  });

  it('does not accept the query-token fallback on non-stream admin paths', async () => {
    // Same token that works on /admin/stream should fail on /admin/apps
    // because the header fallback is scoped to the stream path only.
    const res = await app.request(`/api/admin/apps?token=${ownerToken}`, {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });
});
