import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '../../index';
import { db } from '../../lib/db';
import { _testResetRateLimit } from '../../middleware/rateLimit';

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
});

let ownerToken: string;

beforeEach(async () => {
  db._testReset();
  _testResetRateLimit();

  // Create owner and get session token
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rob', password: 'test123' }),
  });
  const body = await res.json();
  ownerToken = body.sessionToken;
});

function adminReq(method: string, path: string, body?: object) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return app.request(path, opts);
}

function noAuthReq(method: string, path: string) {
  return app.request(path, { method });
}

describe('Admin auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const res = await noAuthReq('GET', '/api/admin/apps');
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid session token', async () => {
    const res = await app.request('/api/admin/apps', {
      method: 'GET',
      headers: { Authorization: 'Bearer fake-token' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-owner sessions', async () => {
    // Create a code-based session (anonymous user)
    await db.createCode({
      code: 'TEST',
      userId: null,
      appIds: [],
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(),
      label: 'Test',
    });
    const codeRes = await app.request('/api/auth/validate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'TEST' }),
    });
    const { sessionToken } = await codeRes.json();

    const res = await app.request('/api/admin/apps', {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects expired owner session', async () => {
    // Manually expire the session
    await db.updateSession(ownerToken, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await adminReq('GET', '/api/admin/apps');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/apps', () => {
  it('returns empty list initially', async () => {
    const res = await adminReq('GET', '/api/admin/apps');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns all apps', async () => {
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
    });
    const res = await adminReq('GET', '/api/admin/apps');
    const apps = await res.json();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe('portfolio');
  });
});

describe('POST /api/admin/apps', () => {
  it('creates an app', async () => {
    const res = await adminReq('POST', '/api/admin/apps', {
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe('portfolio');
    expect(body.active).toBe(true);
    expect(body.iconUrl).toBe('');
    expect(body.description).toBe('');
  });

  it('rejects missing required fields', async () => {
    const res = await adminReq('POST', '/api/admin/apps', {
      id: 'portfolio',
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate app id', async () => {
    await adminReq('POST', '/api/admin/apps', {
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
    });
    const res = await adminReq('POST', '/api/admin/apps', {
      id: 'portfolio',
      name: 'Portfolio 2',
      url: 'https://other.vercel.app',
    });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/admin/apps/:id', () => {
  beforeEach(async () => {
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
    });
  });

  it('updates an app', async () => {
    const res = await adminReq('PUT', '/api/admin/apps/portfolio', {
      name: 'My Portfolio',
      description: 'Updated description',
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe('My Portfolio');
    expect(body.description).toBe('Updated description');
    expect(body.id).toBe('portfolio');
  });

  it('returns 404 for nonexistent app', async () => {
    const res = await adminReq('PUT', '/api/admin/apps/nope', {
      name: 'x',
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/apps/:id', () => {
  it('deletes an app', async () => {
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
    });
    const res = await adminReq('DELETE', '/api/admin/apps/portfolio');
    expect(res.status).toBe(200);

    const listRes = await adminReq('GET', '/api/admin/apps');
    expect(await listRes.json()).toEqual([]);
  });

  it('returns 404 for nonexistent app', async () => {
    const res = await adminReq('DELETE', '/api/admin/apps/nope');
    expect(res.status).toBe(404);
  });
});
