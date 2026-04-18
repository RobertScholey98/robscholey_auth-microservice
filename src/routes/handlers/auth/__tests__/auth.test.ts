import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '@/index';
import { db, hashPassword } from '@/lib';
import { _testResetRateLimit } from '@/middleware';

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
});

beforeEach(async () => {
  await db._testReset();
  _testResetRateLimit();
});

function json(body: object) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function setupOwner() {
  const res = await app.request('/api/auth/setup', json({ username: 'rob', password: 'test123' }));
  return res.json();
}

describe('POST /api/auth/setup', () => {
  it('creates an owner and returns session + jwt', async () => {
    const res = await app.request(
      '/api/auth/setup',
      json({ username: 'rob', password: 'test123' }),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.sessionToken).toMatch(/^sess_/);
    expect(body.jwt).toBeDefined();
    expect(body.user).toEqual({
      id: expect.any(String),
      name: 'rob',
      type: 'owner',
    });
    expect(body.apps).toEqual([]);
  });

  it('rejects second setup attempt', async () => {
    await setupOwner();
    const res = await app.request('/api/auth/setup', json({ username: 'rob2', password: 'pass' }));
    expect(res.status).toBe(403);
  });

  it('rejects missing fields', async () => {
    const res = await app.request('/api/auth/setup', json({ username: 'rob' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await setupOwner();
    const res = await app.request(
      '/api/auth/login',
      json({ username: 'rob', password: 'test123' }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessionToken).toMatch(/^sess_/);
    expect(body.user.type).toBe('owner');
  });

  it('rejects wrong password', async () => {
    await setupOwner();
    const res = await app.request('/api/auth/login', json({ username: 'rob', password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects nonexistent user', async () => {
    await setupOwner();
    const res = await app.request(
      '/api/auth/login',
      json({ username: 'nobody', password: 'test' }),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/validate-code', () => {
  async function createCode(
    code: string,
    opts: { passwordHash?: string; userId?: string; expiresAt?: Date } = {},
  ) {
    await db.createCode({
      code,
      userId: opts.userId ?? null,
      appIds: ['portfolio'],
      passwordHash: opts.passwordHash ?? null,
      expiresAt: opts.expiresAt ?? null,
      createdAt: new Date(),
      label: 'Test',
    });
  }

  it('validates a public code', async () => {
    await createCode('XK7F2');
    const res = await app.request('/api/auth/validate-code', json({ code: 'XK7F2' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessionToken).toMatch(/^sess_/);
    expect(body.user.type).toBe('anonymous');
  });

  it('returns requiresPassword for private code without password', async () => {
    await createCode('PRIV', { passwordHash: '$2b$10$hashedvalue' });
    const res = await app.request('/api/auth/validate-code', json({ code: 'PRIV' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresPassword).toBe(true);
  });

  it('rejects invalid code', async () => {
    const res = await app.request('/api/auth/validate-code', json({ code: 'NOPE' }));
    expect(res.status).toBe(401);
  });

  it('validates a private code with correct password', async () => {
    const hash = await hashPassword('secret');
    await createCode('PRIV2', { passwordHash: hash });
    const res = await app.request(
      '/api/auth/validate-code',
      json({ code: 'PRIV2', password: 'secret' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionToken).toMatch(/^sess_/);
  });

  it('rejects a private code with wrong password', async () => {
    const hash = await hashPassword('secret');
    await createCode('PRIV3', { passwordHash: hash });
    const res = await app.request(
      '/api/auth/validate-code',
      json({ code: 'PRIV3', password: 'wrong' }),
    );
    expect(res.status).toBe(401);
  });

  it('resolves a named user when code has userId', async () => {
    await db.createUser({
      id: 'sarah-id',
      name: 'Sarah',
      type: 'named',
      createdAt: new Date(),
    });
    await createCode('SARAH', { userId: 'sarah-id' });
    const res = await app.request('/api/auth/validate-code', json({ code: 'SARAH' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('Sarah');
    expect(body.user.type).toBe('named');
  });

  it('rejects missing code field', async () => {
    const res = await app.request('/api/auth/validate-code', json({}));
    expect(res.status).toBe(400);
  });

  it('rejects expired code', async () => {
    await createCode('OLD', { expiresAt: new Date(Date.now() - 1000) });
    const res = await app.request('/api/auth/validate-code', json({ code: 'OLD' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/session', () => {
  it('validates a session and returns fresh jwt', async () => {
    const { sessionToken } = await setupOwner();
    const res = await app.request(`/api/auth/session?token=${sessionToken}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.jwt).toBeDefined();
    expect(body.user.type).toBe('owner');
  });

  it('rejects invalid token', async () => {
    const res = await app.request('/api/auth/session?token=fake');
    expect(res.status).toBe(401);
  });

  it('rejects missing token', async () => {
    const res = await app.request('/api/auth/session');
    expect(res.status).toBe(400);
  });

  it('rejects and deletes an expired session', async () => {
    // Create a session that's already expired
    await db.createUser({
      id: 'user-exp',
      name: 'Expired',
      type: 'named',
      createdAt: new Date(),
    });
    await db.createSession({
      token: 'sess_expired',
      codeId: null,
      userId: 'user-exp',
      appIds: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await app.request('/api/auth/session?token=sess_expired');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Session expired');

    // Session should be deleted
    expect(await db.getSession('sess_expired')).toBeNull();
  });

  it('updates lastActiveAt on validation', async () => {
    const { sessionToken } = await setupOwner();
    const before = (await db.getSession(sessionToken))!.lastActiveAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));

    await app.request(`/api/auth/session?token=${sessionToken}`);
    const after = (await db.getSession(sessionToken))!.lastActiveAt;
    expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates a session', async () => {
    const { sessionToken } = await setupOwner();

    const logoutRes = await app.request('/api/auth/logout', json({ sessionToken }));
    expect(logoutRes.status).toBe(200);

    const sessionRes = await app.request(`/api/auth/session?token=${sessionToken}`);
    expect(sessionRes.status).toBe(401);
  });

  it('succeeds even with invalid token (idempotent)', async () => {
    const res = await app.request('/api/auth/logout', json({ sessionToken: 'nonexistent' }));
    expect(res.status).toBe(200);
  });

  it('rejects missing sessionToken', async () => {
    const res = await app.request('/api/auth/logout', json({}));
    expect(res.status).toBe(400);
  });
});

describe('Rate limiting', () => {
  it('blocks after 5 failed login attempts', async () => {
    await setupOwner();
    for (let i = 0; i < 5; i++) {
      const res = await app.request(
        '/api/auth/login',
        json({ username: 'rob', password: 'wrong' }),
      );
      expect(res.status).toBe(401);
    }
    const blocked = await app.request(
      '/api/auth/login',
      json({ username: 'rob', password: 'wrong' }),
    );
    expect(blocked.status).toBe(429);
  });

  it('blocks after 5 failed validate-code attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await app.request('/api/auth/validate-code', json({ code: 'WRONG' }));
    }
    const blocked = await app.request('/api/auth/validate-code', json({ code: 'WRONG' }));
    expect(blocked.status).toBe(429);
  });
});

describe('CORS', () => {
  it('returns CORS headers for allowed origin', async () => {
    const res = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('does not return allow-origin for disallowed origin', async () => {
    const res = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://evil.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('http://evil.com');
  });
});

describe('Health check', () => {
  it('returns status ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
