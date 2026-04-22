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

let sessionToken: string;

beforeEach(async () => {
  await resetDatabase(db);
  _testResetRateLimit();

  // Register an app before setup so the owner session captures it in appIds
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

  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rob', password: 'test123' }),
  });
  const body = await res.json();
  sessionToken = body.sessionToken;
});

function json(body: object) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('POST /api/log-access', () => {
  it('logs an access event', async () => {
    const res = await app.request('/api/log-access', json({ sessionToken, appId: 'portfolio' }));
    expect(res.status).toBe(200);

    const logs = await db.accessLogs.query({ appId: 'portfolio' });
    expect(logs).toHaveLength(1);
    expect(logs[0].sessionToken).toBe(sessionToken);
    expect(logs[0].appId).toBe('portfolio');
  });

  it('refreshes the session last_active_at timestamp', async () => {
    const before = await db.sessions.get(sessionToken);
    expect(before).not.toBeNull();
    // Wait one ms so the comparison can detect a fresh timestamp even when
    // the setup session was created within the same millisecond.
    await new Promise((r) => setTimeout(r, 5));

    const res = await app.request('/api/log-access', json({ sessionToken, appId: 'portfolio' }));
    expect(res.status).toBe(200);

    const after = await db.sessions.get(sessionToken);
    expect(after).not.toBeNull();
    expect(after!.lastActiveAt.getTime()).toBeGreaterThan(before!.lastActiveAt.getTime());
  });

  it('rejects missing fields', async () => {
    const res = await app.request('/api/log-access', json({ sessionToken }));
    expect(res.status).toBe(400);
  });

  it('rejects appId not in session permitted apps', async () => {
    const res = await app.request(
      '/api/log-access',
      json({ sessionToken, appId: 'not-permitted' }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects invalid session token', async () => {
    const res = await app.request(
      '/api/log-access',
      json({ sessionToken: 'fake', appId: 'portfolio' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns validation.failed with fields[] when required fields are missing', async () => {
    const res = await app.request('/api/log-access', json({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation.failed');
    expect(Array.isArray(body.error.fields)).toBe(true);
    expect(body.error.fields.length).toBeGreaterThan(0);
  });
});
