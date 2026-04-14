import { Hono } from 'hono';
import { db } from '../lib/db';
import { hashPassword, comparePassword } from '../lib/password';
import { createSessionToken } from '../lib/session';
import { signJWT } from '../lib/jwt';

const auth = new Hono();

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

  const allApps = await db.getApps();
  const appIds = allApps.map((a) => a.id);
  const token = createSessionToken();
  const now = new Date();

  await db.createSession({
    token,
    codeId: null,
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

  return c.json({
    sessionToken: token,
    jwt,
    user: { id: user.id, name: user.name, type: user.type },
    apps: allApps,
  });
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

  const allApps = await db.getApps();
  const appIds = allApps.map((a) => a.id);
  const token = createSessionToken();
  const now = new Date();

  await db.createSession({
    token,
    codeId: null,
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

  return c.json({
    sessionToken: token,
    jwt,
    user: { id: user.id, name: user.name, type: user.type },
    apps: allApps,
  });
});

export { auth as authRoutes };
