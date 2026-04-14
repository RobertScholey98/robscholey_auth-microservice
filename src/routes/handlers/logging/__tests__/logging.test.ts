import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '@/index';
import { db } from '@/lib';
import { _testResetRateLimit } from '@/middleware';

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
});

let sessionToken: string;

beforeEach(async () => {
  db._testReset();
  _testResetRateLimit();

  // Register an app before setup so the owner session captures it in appIds
  await db.createApp({
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
    const res = await app.request(
      '/api/log-access',
      json({ sessionToken, appId: 'portfolio' })
    );
    expect(res.status).toBe(200);

    const logs = await db.getAccessLogs({ appId: 'portfolio' });
    expect(logs).toHaveLength(1);
    expect(logs[0].sessionToken).toBe(sessionToken);
    expect(logs[0].appId).toBe('portfolio');
  });

  it('rejects missing fields', async () => {
    const res = await app.request(
      '/api/log-access',
      json({ sessionToken })
    );
    expect(res.status).toBe(400);
  });

  it('rejects appId not in session permitted apps', async () => {
    const res = await app.request(
      '/api/log-access',
      json({ sessionToken, appId: 'not-permitted' })
    );
    expect(res.status).toBe(403);
  });

  it('rejects invalid session token', async () => {
    const res = await app.request(
      '/api/log-access',
      json({ sessionToken: 'fake', appId: 'portfolio' })
    );
    expect(res.status).toBe(401);
  });
});
