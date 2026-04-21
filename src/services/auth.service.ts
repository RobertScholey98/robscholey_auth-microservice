import { ErrorCode } from '@robscholey/contracts';
import type {
  AuthResponse,
  LoginRequest,
  RequiresPasswordResponse,
  SessionResponse,
  SetupRequest,
  ValidateCodeRequest,
} from '@robscholey/contracts';
import {
  comparePassword,
  createSessionToken,
  ForbiddenError,
  hashPassword,
  signJWT,
  UnauthorizedError,
  type Database,
} from '@/lib';
import { loadAppsConfig } from '@/lib/appsConfig';
import { appToWire, userToWire } from '@/lib/wire';
import type { App, User } from '@/types';

/** Sessions live for 90 days from creation. */
const SESSION_TTL_DAYS = 90;
/** Millisecond constant used when converting a TTL in days to an absolute expiry. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Factory for the auth service. Owns the cross-aggregate orchestration behind
 * setup / login / validate-code / get-session — including the shared
 * session-creation path (`createSessionFor`) and the visible-apps filter that
 * intersects the session's permitted apps with the active-and-in-config set.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns An auth service bound to `db`.
 */
export function createAuthService(db: Database) {
  async function getAllAppIds(): Promise<string[]> {
    return (await db.apps.list()).map((a) => a.id);
  }

  async function visibleAppsFor(
    appIds: string[],
    userType: User['type'] | null,
  ): Promise<App[]> {
    const [all, config] = await Promise.all([db.apps.list(), loadAppsConfig()]);
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

  async function createSessionFor(
    user: User,
    codeId: string | null,
    appIds: string[],
  ): Promise<AuthResponse> {
    const token = createSessionToken();
    const now = new Date();

    await db.sessions.create({
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

  return {
    /**
     * One-time owner bootstrap. Creates the first owner account and returns
     * an {@link AuthResponse}. Throws {@link ForbiddenError} if any owner
     * already exists.
     *
     * @param body - Validated setup request.
     */
    async setup(body: SetupRequest): Promise<AuthResponse> {
      const owners = (await db.users.list()).filter((u) => u.type === 'owner');
      if (owners.length > 0) {
        throw new ForbiddenError(ErrorCode.AuthSetupAlreadyCompleted, 'Setup already completed');
      }

      const user = await db.users.create({
        id: crypto.randomUUID(),
        name: body.username,
        type: 'owner',
        username: body.username,
        passwordHash: await hashPassword(body.password),
        createdAt: new Date(),
      });

      return createSessionFor(user, null, await getAllAppIds());
    },

    /**
     * Owner username/password login. Throws {@link UnauthorizedError} on a
     * missing user, non-owner type, or wrong password.
     *
     * @param body - Validated login request.
     */
    async login(body: LoginRequest): Promise<AuthResponse> {
      const user = await db.users.getByUsername(body.username);
      if (!user || user.type !== 'owner' || !user.passwordHash) {
        throw new UnauthorizedError(ErrorCode.AuthInvalidCredentials, 'Invalid credentials');
      }

      const valid = await comparePassword(body.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedError(ErrorCode.AuthInvalidCredentials, 'Invalid credentials');
      }

      return createSessionFor(user, null, await getAllAppIds());
    },

    /**
     * Validates an access code with optional password. Returns
     * `{ requiresPassword: true }` when the code is private and no password
     * was provided. Creates an anonymous user inline when the code is not
     * linked to a named user.
     *
     * @param body - Validated request body.
     */
    async validateCode(
      body: ValidateCodeRequest,
    ): Promise<AuthResponse | RequiresPasswordResponse> {
      const code = await db.codes.get(body.code);
      if (!code) {
        throw new UnauthorizedError(ErrorCode.AuthCodeInvalid, 'Invalid code');
      }

      if (code.expiresAt && code.expiresAt < new Date()) {
        throw new UnauthorizedError(ErrorCode.AuthCodeExpired, 'Code has expired');
      }

      if (code.passwordHash) {
        if (!body.password) {
          return { requiresPassword: true };
        }
        const valid = await comparePassword(body.password, code.passwordHash);
        if (!valid) {
          throw new UnauthorizedError(ErrorCode.AuthPasswordInvalid, 'Invalid password');
        }
      }

      let user: User;
      if (code.userId) {
        const existing = await db.users.get(code.userId);
        if (!existing) {
          throw new UnauthorizedError(ErrorCode.AuthCodeInvalid, 'Invalid code');
        }
        user = existing;
      } else {
        user = await db.users.create({
          id: crypto.randomUUID(),
          name: 'Anonymous',
          type: 'anonymous',
          createdAt: new Date(),
        });
      }

      return createSessionFor(user, code.code, code.appIds);
    },

    /**
     * Validates a session token and returns the user, visible apps, and a
     * fresh JWT. Expired sessions are deleted and rejected. Owner sessions
     * are elevated to all-apps visibility at validation time. When the
     * session was minted from an access code with an expiry, the resolved
     * `codeExpiresAt` rides along so the shell can render a countdown
     * without a second round-trip.
     *
     * @param token - Session token from the query string.
     */
    async getSession(token: string): Promise<SessionResponse> {
      const session = await db.sessions.get(token);
      if (!session) {
        throw new UnauthorizedError(ErrorCode.AuthSessionInvalid, 'Invalid session');
      }

      if (session.expiresAt < new Date()) {
        await db.sessions.delete(token);
        throw new UnauthorizedError(ErrorCode.AuthSessionExpired, 'Session expired');
      }

      await db.sessions.update(token, { lastActiveAt: new Date() });

      const user = session.userId ? await db.users.get(session.userId) : null;

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

      let codeExpiresAt: string | undefined;
      if (session.codeId) {
        const code = await db.codes.get(session.codeId);
        if (code?.expiresAt) {
          codeExpiresAt = code.expiresAt.toISOString();
        }
      }

      return {
        sessionToken: token,
        jwt,
        user: user ? userToWire(user) : null,
        apps: apps.map(appToWire),
        ...(codeExpiresAt !== undefined ? { codeExpiresAt } : {}),
      };
    },

    /**
     * Invalidates a session by deleting it. Idempotent — succeeds whether or
     * not the token maps to an existing session.
     *
     * @param token - Session token to invalidate.
     */
    async logout(token: string): Promise<void> {
      await db.sessions.delete(token);
    },
  };
}

/** Public type of the auth service. */
export type AuthService = ReturnType<typeof createAuthService>;
