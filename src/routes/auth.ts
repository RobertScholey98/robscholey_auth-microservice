import { Hono } from 'hono';
import type { Context } from 'hono';
import { db } from '../lib/db';
import { hashPassword, comparePassword } from '../lib/password';
import { createSessionToken } from '../lib/session';
import { signJWT } from '../lib/jwt';
import type { User } from '../types';

const auth = new Hono();

async function createAuthResponse(
  user: User,
  codeId: string | null,
  appIds: string[]
) {
  const token = createSessionToken();
  const now = new Date();

  await db.createSession({
    token,
    codeId,
    userId: user.id,
    appIds,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
  });

  const jwt = await signJWT({
    sub: user.id,
    name: user.name,
    type: user.type,
  });

  const apps = (await db.getApps()).filter((a) => appIds.includes(a.id));

  return {
    sessionToken: token,
    jwt,
    user: { id: user.id, name: user.name, type: user.type },
    apps,
  };
}

// POST /auth/setup — one-time owner bootstrap
auth.post('/setup', async (c) => {
  const owners = (await db.getUsers()).filter((u) => u.type === 'owner');
  if (owners.length > 0) {
    return c.json({ error: 'Setup already completed' }, 403);
  }

  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const user = await db.createUser({
    id: crypto.randomUUID(),
    name: body.username,
    type: 'owner',
    username: body.username,
    passwordHash: await hashPassword(body.password),
    createdAt: new Date(),
  });

  const allAppIds = (await db.getApps()).map((a) => a.id);
  return c.json(await createAuthResponse(user, null, allAppIds));
});

// POST /auth/login — owner username/password login
auth.post('/login', async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const user = await db.getUserByUsername(body.username);
  if (!user || user.type !== 'owner' || !user.passwordHash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await comparePassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const allAppIds = (await db.getApps()).map((a) => a.id);
  return c.json(await createAuthResponse(user, null, allAppIds));
});

// POST /auth/validate-code — code + optional password
auth.post('/validate-code', async (c) => {
  const body = await c.req.json<{ code: string; password?: string }>();
  if (!body.code) {
    return c.json({ error: 'Code is required' }, 400);
  }

  const code = await db.getCode(body.code);
  if (!code) {
    return c.json({ error: 'Invalid code' }, 401);
  }

  if (code.expiresAt && code.expiresAt < new Date()) {
    return c.json({ error: 'Code has expired' }, 401);
  }

  // Private code — needs password
  if (code.passwordHash) {
    if (!body.password) {
      return c.json({ requiresPassword: true }, 200);
    }
    const valid = await comparePassword(body.password, code.passwordHash);
    if (!valid) {
      return c.json({ error: 'Invalid password' }, 401);
    }
  }

  // Resolve user (if code is linked to one, otherwise create anonymous)
  let user: User;
  if (code.userId) {
    const existing = await db.getUser(code.userId);
    if (!existing) {
      return c.json({ error: 'Invalid code' }, 401);
    }
    user = existing;
  } else {
    user = await db.createUser({
      id: crypto.randomUUID(),
      name: 'Anonymous',
      type: 'anonymous',
      createdAt: new Date(),
    });
  }

  return c.json(await createAuthResponse(user, code.code, code.appIds));
});

// GET /auth/session — validate token, return apps + fresh JWT
auth.get('/session', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Token is required' }, 400);
  }

  const session = await db.getSession(token);
  if (!session) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  if (session.expiresAt < new Date()) {
    await db.deleteSession(token);
    return c.json({ error: 'Session expired' }, 401);
  }

  await db.updateSession(token, { lastActiveAt: new Date() });

  const user = session.userId ? await db.getUser(session.userId) : null;

  // Owner sessions get all current apps; code sessions keep their snapshot
  let appIds = session.appIds;
  if (user?.type === 'owner') {
    appIds = (await db.getApps()).map((a) => a.id);
  }

  const apps = (await db.getApps()).filter((a) => appIds.includes(a.id));

  const jwt = await signJWT({
    sub: user?.id ?? 'anonymous',
    name: user?.name ?? 'Anonymous',
    type: user?.type ?? 'anonymous',
  });

  return c.json({
    sessionToken: token,
    jwt,
    user: user
      ? { id: user.id, name: user.name, type: user.type }
      : null,
    apps,
  });
});

// POST /auth/logout — invalidate session
auth.post('/logout', async (c) => {
  const body = await c.req.json<{ sessionToken: string }>();
  if (!body.sessionToken) {
    return c.json({ error: 'Session token is required' }, 400);
  }

  await db.deleteSession(body.sessionToken);
  return c.json({ success: true });
});

export { auth as authRoutes };
