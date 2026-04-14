import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '@/index';
import { db } from '@/lib';
import { _testResetRateLimit } from '@/middleware';

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

// --- User CRUD ---

describe('GET /api/admin/users', () => {
  it('returns the owner user created during setup', async () => {
    const res = await adminReq('GET', '/api/admin/users');
    const users = await res.json();
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(users.find((u: { type: string }) => u.type === 'owner')).toBeDefined();
  });
});

describe('POST /api/admin/users', () => {
  it('creates a named user', async () => {
    const res = await adminReq('POST', '/api/admin/users', {
      name: 'Sarah',
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe('Sarah');
    expect(body.type).toBe('named');
    expect(body.id).toBeDefined();
  });

  it('rejects missing name', async () => {
    const res = await adminReq('POST', '/api/admin/users', {});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/admin/users/:id', () => {
  it('updates a user', async () => {
    const createRes = await adminReq('POST', '/api/admin/users', {
      name: 'Sarah',
    });
    const { id } = await createRes.json();

    const res = await adminReq('PUT', `/api/admin/users/${id}`, {
      name: 'Sarah Updated',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Sarah Updated');
  });

  it('returns 404 for nonexistent user', async () => {
    const res = await adminReq('PUT', '/api/admin/users/fake', {
      name: 'x',
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes a user and cascades to codes and sessions', async () => {
    // Create user
    const userRes = await adminReq('POST', '/api/admin/users', {
      name: 'Sarah',
    });
    const { id: userId } = await userRes.json();

    // Create an app for the code
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
    });

    // Create a code for this user
    const codeRes = await adminReq('POST', '/api/admin/codes', {
      userId,
      appIds: ['portfolio'],
      label: 'Sarah access',
    });
    const { code: codeString } = await codeRes.json();

    // Use the code to create a session
    const validateRes = await app.request('/api/auth/validate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeString }),
    });
    const { sessionToken } = await validateRes.json();

    // Delete the user
    const deleteRes = await adminReq('DELETE', `/api/admin/users/${userId}`);
    expect(deleteRes.status).toBe(200);

    // Verify cascade: user, code, and session should all be gone
    expect(await db.getUser(userId)).toBeNull();
    expect(await db.getCode(codeString)).toBeNull();
    expect(await db.getSession(sessionToken)).toBeNull();
  });

  it('returns 404 for nonexistent user', async () => {
    const res = await adminReq('DELETE', '/api/admin/users/fake');
    expect(res.status).toBe(404);
  });
});

// --- Code CRUD ---

describe('GET /api/admin/codes', () => {
  it('returns empty list initially', async () => {
    const res = await adminReq('GET', '/api/admin/codes');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('POST /api/admin/codes', () => {
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

  it('generates a code with auto-generated code string', async () => {
    const res = await adminReq('POST', '/api/admin/codes', {
      appIds: ['portfolio'],
      label: 'Test code',
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.code).toMatch(/^[A-Z0-9]{5}$/);
    expect(body.appIds).toEqual(['portfolio']);
    expect(body.hasPassword).toBe(false);
    expect(body.passwordHash).toBeUndefined();
    expect(body.userId).toBeNull();
    expect(body.label).toBe('Test code');
  });

  it('creates a code with a custom code string', async () => {
    const res = await adminReq('POST', '/api/admin/codes', {
      code: 'MYCODE',
      appIds: ['portfolio'],
    });
    expect(res.status).toBe(201);
    expect((await res.json()).code).toBe('MYCODE');
  });

  it('creates a private code with password', async () => {
    const res = await adminReq('POST', '/api/admin/codes', {
      appIds: ['portfolio'],
      password: 'secret123',
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.hasPassword).toBe(true);
    expect(body.passwordHash).toBeUndefined();
  });

  it('creates a code with expiry', async () => {
    const res = await adminReq('POST', '/api/admin/codes', {
      appIds: ['portfolio'],
      expiresIn: 86400, // 1 day in seconds
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.expiresAt).not.toBeNull();
  });

  it('creates a code linked to a user', async () => {
    const userRes = await adminReq('POST', '/api/admin/users', {
      name: 'Sarah',
    });
    const { id: userId } = await userRes.json();

    const res = await adminReq('POST', '/api/admin/codes', {
      userId,
      appIds: ['portfolio'],
    });
    expect(res.status).toBe(201);
    expect((await res.json()).userId).toBe(userId);
  });

  it('rejects empty appIds', async () => {
    const res = await adminReq('POST', '/api/admin/codes', {
      appIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('rejects nonexistent userId', async () => {
    const res = await adminReq('POST', '/api/admin/codes', {
      userId: 'fake',
      appIds: ['portfolio'],
    });
    expect(res.status).toBe(404);
  });

  it('rejects duplicate code string', async () => {
    await adminReq('POST', '/api/admin/codes', {
      code: 'DUP',
      appIds: ['portfolio'],
    });
    const res = await adminReq('POST', '/api/admin/codes', {
      code: 'DUP',
      appIds: ['portfolio'],
    });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/admin/codes/:code', () => {
  it('updates a code', async () => {
    await db.createCode({
      code: 'XK7F2',
      userId: null,
      appIds: ['portfolio'],
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(),
      label: 'Original',
    });

    const res = await adminReq('PUT', '/api/admin/codes/XK7F2', {
      label: 'Updated',
      appIds: ['portfolio', 'admin'],
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.label).toBe('Updated');
    expect(body.appIds).toEqual(['portfolio', 'admin']);
    expect(body.code).toBe('XK7F2');
  });

  it('returns 404 for nonexistent code', async () => {
    const res = await adminReq('PUT', '/api/admin/codes/NOPE', {
      label: 'x',
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/codes/:code', () => {
  it('deletes a code and cascades to sessions', async () => {
    await db.createCode({
      code: 'XK7F2',
      userId: null,
      appIds: ['portfolio'],
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(),
      label: 'Test',
    });

    // Create a session from this code
    await db.createSession({
      token: 'sess_test',
      codeId: 'XK7F2',
      userId: null,
      appIds: ['portfolio'],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await adminReq('DELETE', '/api/admin/codes/XK7F2');
    expect(res.status).toBe(200);

    expect(await db.getCode('XK7F2')).toBeNull();
    expect(await db.getSession('sess_test')).toBeNull();
  });

  it('returns 404 for nonexistent code', async () => {
    const res = await adminReq('DELETE', '/api/admin/codes/NOPE');
    expect(res.status).toBe(404);
  });
});

// --- Sessions ---

describe('GET /api/admin/sessions', () => {
  it('returns all sessions', async () => {
    const res = await adminReq('GET', '/api/admin/sessions');
    expect(res.status).toBe(200);

    const sessions = await res.json();
    // At least the owner session from setup
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by codeId', async () => {
    await db.createSession({
      token: 'sess_code1',
      codeId: 'ABC',
      userId: null,
      appIds: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await adminReq('GET', '/api/admin/sessions?codeId=ABC');
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].codeId).toBe('ABC');
  });
});

describe('DELETE /api/admin/sessions/:token', () => {
  it('deletes a session', async () => {
    await db.createSession({
      token: 'sess_to_delete',
      codeId: null,
      userId: null,
      appIds: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await adminReq('DELETE', '/api/admin/sessions/sess_to_delete');
    expect(res.status).toBe(200);
    expect(await db.getSession('sess_to_delete')).toBeNull();
  });

  it('returns 404 for nonexistent session', async () => {
    const res = await adminReq('DELETE', '/api/admin/sessions/fake');
    expect(res.status).toBe(404);
  });
});

// --- Analytics ---

describe('GET /api/admin/analytics', () => {
  beforeEach(async () => {
    const now = new Date();
    await db.logAccess({
      id: 'log-1',
      sessionToken: ownerToken,
      codeId: null,
      appId: 'portfolio',
      accessedAt: now,
      userAgent: 'test',
    });
    await db.logAccess({
      id: 'log-2',
      sessionToken: ownerToken,
      codeId: null,
      appId: 'admin',
      accessedAt: now,
      userAgent: 'test',
    });
    await db.logAccess({
      id: 'log-3',
      sessionToken: 'sess_other',
      codeId: 'XK7F2',
      appId: 'portfolio',
      accessedAt: new Date(now.getTime() - 86400000), // yesterday
      userAgent: 'test',
    });
  });

  it('returns all logs and stats with no filters', async () => {
    const res = await adminReq('GET', '/api/admin/analytics');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.logs).toHaveLength(3);
    expect(body.stats.totalAccesses).toBe(3);
    expect(body.stats.uniqueSessions).toBe(2);
    expect(body.stats.appBreakdown.portfolio).toBe(2);
    expect(body.stats.appBreakdown.admin).toBe(1);
  });

  it('filters by appId', async () => {
    const res = await adminReq('GET', '/api/admin/analytics?appId=portfolio');
    const body = await res.json();
    expect(body.logs).toHaveLength(2);
    expect(body.stats.totalAccesses).toBe(2);
  });

  it('filters by codeId', async () => {
    const res = await adminReq('GET', '/api/admin/analytics?codeId=XK7F2');
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].codeId).toBe('XK7F2');
  });

  it('filters by date range', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 3600000).toISOString(); // 1 hour ago
    const to = new Date(now.getTime() + 3600000).toISOString(); // 1 hour from now

    const res = await adminReq('GET', `/api/admin/analytics?from=${from}&to=${to}`);
    const body = await res.json();
    // Only today's 2 logs, not yesterday's
    expect(body.logs).toHaveLength(2);
  });
});
