import type { Context } from 'hono';
import {
  setupSchema,
  loginSchema,
  validateCodeSchema,
  logoutSchema,
  getSessionQuerySchema,
} from '@robscholey/contracts';
import type { Env } from '@/index';

/** One-time owner bootstrap. Creates the first owner account. Sealed after first use. */
export async function setup(c: Context<Env>) {
  const body = setupSchema.parse(await c.req.json());
  const response = await c.get('services').auth.setup(body);
  c.get('logger').info({ event: 'auth.setup.success', userId: response.user.id });
  return c.json(response, 201);
}

/**
 * Owner username/password login. Returns session token, JWT, and all apps.
 *
 * Emits `auth.login.success` on success with the owner's id. Rethrows the
 * original error after logging `auth.login.failure` with the attempted
 * username — the central error mapper still records the 4xx line, but the
 * domain event carries the subject so operators can spot credential-spray.
 */
export async function login(c: Context<Env>) {
  const body = loginSchema.parse(await c.req.json());
  try {
    const response = await c.get('services').auth.login(body);
    c.get('logger').info({ event: 'auth.login.success', userId: response.user.id });
    return c.json(response);
  } catch (err) {
    c.get('logger').info({ event: 'auth.login.failure', username: body.username });
    throw err;
  }
}

/**
 * Validates an access code with optional password. Returns
 * `{ requiresPassword: true }` when the code is private and no password was
 * provided; otherwise returns the standard auth response.
 *
 * Distinguishes three outcomes on the logger: `requiresPassword` (the code
 * is private and the client needs to retry), `success` (session minted),
 * and `failure` (code invalid / expired / wrong password).
 */
export async function validateCode(c: Context<Env>) {
  const body = validateCodeSchema.parse(await c.req.json());
  const logger = c.get('logger');
  try {
    const response = await c.get('services').auth.validateCode(body);
    if ('requiresPassword' in response) {
      logger.info({ event: 'auth.validateCode.requiresPassword', codeId: body.code });
    } else {
      logger.info({
        event: 'auth.validateCode.success',
        codeId: body.code,
        userId: response.user.id,
      });
    }
    return c.json(response);
  } catch (err) {
    logger.info({ event: 'auth.validateCode.failure', codeId: body.code });
    throw err;
  }
}

/**
 * Validates a session token and returns the user, apps, and a fresh JWT.
 *
 * Logged at `debug` — the admin UI calls this on every page render, so
 * elevating it to `info` would drown everything else out. Flip `LOG_LEVEL`
 * to `debug` when you actually need it.
 */
export async function getSession(c: Context<Env>) {
  const { token } = getSessionQuerySchema.parse(c.req.query());
  const response = await c.get('services').auth.getSession(token);
  c.get('logger').debug({
    event: 'auth.session.refresh',
    userId: response.user?.id ?? null,
  });
  return c.json(response);
}

/** Invalidates a session by deleting it. Idempotent — succeeds even if the session doesn't exist. */
export async function logout(c: Context<Env>) {
  const body = logoutSchema.parse(await c.req.json());
  await c.get('services').auth.logout(body.sessionToken);
  c.get('logger').info({ event: 'auth.logout' });
  return c.json({ success: true });
}
