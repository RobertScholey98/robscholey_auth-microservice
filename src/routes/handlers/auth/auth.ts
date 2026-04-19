import type { Context } from 'hono';
import {
  setupSchema,
  loginSchema,
  validateCodeSchema,
  logoutSchema,
  getSessionQuerySchema,
  ErrorCode,
} from '@robscholey/contracts';
import type { AuthResponse, SessionResponse } from '@robscholey/contracts';
import {
  db,
  hashPassword,
  comparePassword,
  createSessionToken,
  signJWT,
  ForbiddenError,
  UnauthorizedError,
} from '@/lib';
import { loadAppsConfig } from '@/lib/appsConfig';
import type { App, User } from '@/types';
import { appToWire, userToWire } from '@/lib/wire';

/** Sessions live for 90 days from creation. */
const SESSION_TTL_DAYS = 90;
/** Millisecond constant used when converting a TTL in days to an absolute expiry. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns every registered app's ID. Used to grant owner sessions full
 * access — owners see every app regardless of what was persisted on the
 * session at creation time.
 *
 * @returns An array of every app ID currently in the database.
 */
async function getAllAppIds(): Promise<string[]> {
  return (await db.getApps()).map((a) => a.id);
}

/**
 * Returns the apps visible to the shell for a given set of session appIds —
 * intersected with active=true AND present in appsConfig.json. Orphan rows,
 * inactive apps, and `ownerOnly` apps (for non-owners) are filtered out.
 */
async function visibleAppsFor(appIds: string[], userType: User['type'] | null): Promise<App[]> {
  const [all, config] = await Promise.all([db.getApps(), loadAppsConfig()]);
  const configById = new Map(config.map((a) => [a.id, a]));
  const allowed = new Set(appIds);
  return all.filter((a) => {
    const cfg = configById.get(a.id);
    if (!cfg) return false;
    if (!a.active) return false;
    if (!allowed.has(a.id)) return false;
    if (cfg.ownerOnly && userType !== 'owner') return false;
    return true;
  });
}

/**
 * Creates a session, signs a JWT, and builds the standard auth response object.
 * Shared by setup, login, and validate-code handlers to ensure a consistent response shape.
 * @param user - The authenticated user.
 * @param codeId - The access code used to authenticate, or `null` for owner login.
 * @param appIds - The app IDs this session grants access to.
 * @returns The wire-shaped auth response containing sessionToken, jwt, user, and apps.
 */
async function createAuthResponse(
  user: User,
  codeId: string | null,
  appIds: string[],
): Promise<AuthResponse> {
  const token = createSessionToken();
  const now = new Date();

  await db.createSession({
    token,
    codeId,
    userId: user.id,
    appIds,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * MS_PER_DAY),
  });

  const jwt = await signJWT({
    sub: user.id,
    name: user.name,
    type: user.type,
  });

  const apps = await visibleAppsFor(appIds, user.type);

  return {
    sessionToken: token,
    jwt,
    user: userToWire(user),
    apps: apps.map(appToWire),
  };
}

/** One-time owner bootstrap. Creates the first owner account. Sealed after first use. */
export async function setup(c: Context) {
  const owners = (await db.getUsers()).filter((u) => u.type === 'owner');
  if (owners.length > 0) {
    throw new ForbiddenError(ErrorCode.AuthSetupAlreadyCompleted, 'Setup already completed');
  }

  const body = setupSchema.parse(await c.req.json());

  const user = await db.createUser({
    id: crypto.randomUUID(),
    name: body.username,
    type: 'owner',
    username: body.username,
    passwordHash: await hashPassword(body.password),
    createdAt: new Date(),
  });

  const allAppIds = await getAllAppIds();
  return c.json(await createAuthResponse(user, null, allAppIds), 201);
}

/** Owner username/password login. Returns session token, JWT, and all apps. */
export async function login(c: Context) {
  const body = loginSchema.parse(await c.req.json());

  const user = await db.getUserByUsername(body.username);
  if (!user || user.type !== 'owner' || !user.passwordHash) {
    throw new UnauthorizedError(ErrorCode.AuthInvalidCredentials, 'Invalid credentials');
  }

  const valid = await comparePassword(body.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError(ErrorCode.AuthInvalidCredentials, 'Invalid credentials');
  }

  const allAppIds = await getAllAppIds();
  return c.json(await createAuthResponse(user, null, allAppIds));
}

/**
 * Validates an access code with optional password.
 * Returns `{ requiresPassword: true }` if the code is private and no password was provided.
 * Creates an anonymous user if the code is not linked to a named user.
 */
export async function validateCode(c: Context) {
  const body = validateCodeSchema.parse(await c.req.json());

  const code = await db.getCode(body.code);
  if (!code) {
    throw new UnauthorizedError(ErrorCode.AuthCodeInvalid, 'Invalid code');
  }

  if (code.expiresAt && code.expiresAt < new Date()) {
    throw new UnauthorizedError(ErrorCode.AuthCodeExpired, 'Code has expired');
  }

  if (code.passwordHash) {
    if (!body.password) {
      return c.json({ requiresPassword: true }, 200);
    }
    const valid = await comparePassword(body.password, code.passwordHash);
    if (!valid) {
      throw new UnauthorizedError(ErrorCode.AuthPasswordInvalid, 'Invalid password');
    }
  }

  let user: User;
  if (code.userId) {
    const existing = await db.getUser(code.userId);
    if (!existing) {
      throw new UnauthorizedError(ErrorCode.AuthCodeInvalid, 'Invalid code');
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
  const { token } = getSessionQuerySchema.parse(c.req.query());

  const session = await db.getSession(token);
  if (!session) {
    throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Invalid session');
  }

  if (session.expiresAt < new Date()) {
    await db.deleteSession(token);
    throw new UnauthorizedError(ErrorCode.AuthSessionExpired, 'Session expired');
  }

  await db.updateSession(token, { lastActiveAt: new Date() });

  const user = session.userId ? await db.getUser(session.userId) : null;

  let appIds = session.appIds;
  if (user?.type === 'owner') {
    appIds = await getAllAppIds();
  }

  const apps = await visibleAppsFor(appIds, user?.type ?? null);

  const jwt = await signJWT({
    sub: user?.id ?? 'anonymous',
    name: user?.name ?? 'Anonymous',
    type: user?.type ?? 'anonymous',
  });

  const response: SessionResponse = {
    sessionToken: token,
    jwt,
    user: user ? userToWire(user) : null,
    apps: apps.map(appToWire),
  };

  return c.json(response);
}

/** Invalidates a session by deleting it. Idempotent — succeeds even if the session doesn't exist. */
export async function logout(c: Context) {
  const body = logoutSchema.parse(await c.req.json());

  await db.deleteSession(body.sessionToken);
  return c.json({ success: true });
}
