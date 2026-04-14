import type { Context } from 'hono';
import { db, hashPassword, comparePassword, createSessionToken, signJWT } from '@/lib';
import type { User } from '@/types';

/**
 * Creates a session, signs a JWT, and builds the standard auth response object.
 * Shared by setup, login, and validate-code handlers to ensure a consistent response shape.
 * @param user - The authenticated user.
 * @param codeId - The access code used to authenticate, or `null` for owner login.
 * @param appIds - The app IDs this session grants access to.
 * @returns The response payload containing sessionToken, jwt, user, and apps.
 */
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

/** One-time owner bootstrap. Creates the first owner account. Sealed after first use. */
export async function setup(c: Context) {
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
}

/** Owner username/password login. Returns session token, JWT, and all apps. */
export async function login(c: Context) {
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
}

/**
 * Validates an access code with optional password.
 * Returns `{ requiresPassword: true }` if the code is private and no password was provided.
 * Creates an anonymous user if the code is not linked to a named user.
 */
export async function validateCode(c: Context) {
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

  if (code.passwordHash) {
    if (!body.password) {
      return c.json({ requiresPassword: true }, 200);
    }
    const valid = await comparePassword(body.password, code.passwordHash);
    if (!valid) {
      return c.json({ error: 'Invalid password' }, 401);
    }
  }

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
}

/** Validates a session token and returns the user, apps, and a fresh JWT. */
export async function getSession(c: Context) {
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
}

/** Invalidates a session by deleting it. Idempotent — succeeds even if the session doesn't exist. */
export async function logout(c: Context) {
  const body = await c.req.json<{ sessionToken: string }>();
  if (!body.sessionToken) {
    return c.json({ error: 'Session token is required' }, 400);
  }

  await db.deleteSession(body.sessionToken);
  return c.json({ success: true });
}
