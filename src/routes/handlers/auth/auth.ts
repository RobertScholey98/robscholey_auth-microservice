import type { Context } from 'hono';
import {
  setupSchema,
  loginSchema,
  validateCodeSchema,
  logoutSchema,
  getSessionQuerySchema,
} from '@robscholey/contracts';
import { services } from '@/services';

/** One-time owner bootstrap. Creates the first owner account. Sealed after first use. */
export async function setup(c: Context) {
  const body = setupSchema.parse(await c.req.json());
  return c.json(await services.auth.setup(body), 201);
}

/** Owner username/password login. Returns session token, JWT, and all apps. */
export async function login(c: Context) {
  const body = loginSchema.parse(await c.req.json());
  return c.json(await services.auth.login(body));
}

/**
 * Validates an access code with optional password. Returns
 * `{ requiresPassword: true }` when the code is private and no password was
 * provided; otherwise returns the standard auth response.
 */
export async function validateCode(c: Context) {
  const body = validateCodeSchema.parse(await c.req.json());
  return c.json(await services.auth.validateCode(body));
}

/** Validates a session token and returns the user, apps, and a fresh JWT. */
export async function getSession(c: Context) {
  const { token } = getSessionQuerySchema.parse(c.req.query());
  return c.json(await services.auth.getSession(token));
}

/** Invalidates a session by deleting it. Idempotent — succeeds even if the session doesn't exist. */
export async function logout(c: Context) {
  const body = logoutSchema.parse(await c.req.json());
  await services.auth.logout(body.sessionToken);
  return c.json({ success: true });
}
