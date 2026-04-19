import type { Context } from 'hono';
import { db, hashPassword } from '@/lib';
import type { AccessCode } from '@/types';

/**
 * Generates a short alphanumeric access code string.
 * Excludes visually ambiguous characters (0, O, 1, I, L).
 * @returns A 5-character uppercase code, e.g. `"XK7F2"`.
 */
function generateCodeString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Strips passwordHash from a code object, replacing it with a hasPassword boolean. */
function sanitizeCode({ passwordHash, ...rest }: AccessCode) {
  return { ...rest, hasPassword: passwordHash !== null };
}

/** Lists all access codes. Strips sensitive fields (passwordHash) from the response. */
export async function listCodes(c: Context) {
  const codes = await db.getCodes();
  return c.json(codes.map(sanitizeCode));
}

/**
 * Creates a new access code. Requires `appIds` (non-empty).
 *
 * The `code` string is optional — auto-generated when blank, used as-is when
 * provided (409 if a code with that string already exists).
 *
 * Exactly one of `userId` or `userName` can be provided to attach the code to
 * a user. `userId` targets an existing user; `userName` creates a new named
 * user on the fly. If both are provided, the request is rejected with 400.
 *
 * Password, if provided, makes the code private and is hashed.
 * `expiresIn` (seconds) is converted to an absolute `expiresAt` date.
 */
export async function createCode(c: Context) {
  const body = await c.req.json<{
    code?: string;
    userId?: string;
    userName?: string;
    appIds: string[];
    password?: string;
    expiresIn?: number;
    label?: string;
  }>();

  if (!body.appIds || body.appIds.length === 0) {
    return c.json({ error: 'appIds is required and must not be empty' }, 400);
  }

  if (body.userId && body.userName) {
    return c.json({ error: 'Provide either userId or userName, not both' }, 400);
  }

  let userId: string | null = null;
  if (body.userId) {
    const user = await db.getUser(body.userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    userId = user.id;
  } else if (body.userName) {
    const trimmed = body.userName.trim();
    if (!trimmed) {
      return c.json({ error: 'userName cannot be blank' }, 400);
    }
    const created = await db.createUser({
      id: crypto.randomUUID(),
      name: trimmed,
      type: 'named',
      createdAt: new Date(),
    });
    userId = created.id;
  }

  const codeString = body.code?.trim() || generateCodeString();

  const existing = await db.getCode(codeString);
  if (existing) {
    return c.json({ error: 'Code already exists' }, 409);
  }

  const accessCode: AccessCode = {
    code: codeString,
    userId,
    appIds: body.appIds,
    passwordHash: body.password ? await hashPassword(body.password) : null,
    expiresAt: body.expiresIn ? new Date(Date.now() + body.expiresIn * 1000) : null,
    createdAt: new Date(),
    label: body.label ?? '',
  };

  return c.json(sanitizeCode(await db.createCode(accessCode)), 201);
}

/** Partially updates an access code. Only `appIds`, `label`, and `expiresAt` can be modified. */
export async function updateCode(c: Context) {
  const code = c.req.param('code')!;
  const body = await c.req.json<{ appIds?: string[]; label?: string; expiresAt?: string | null }>();

  const data: Omit<Partial<AccessCode>, 'code'> = {};
  if (body.appIds !== undefined) data.appIds = body.appIds;
  if (body.label !== undefined) data.label = body.label;
  if (body.expiresAt !== undefined)
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const updated = await db.updateCode(code, data);
  if (!updated) {
    return c.json({ error: 'Code not found' }, 404);
  }

  return c.json(sanitizeCode(updated));
}

/** Revokes an access code. Cascades to all sessions created from this code. */
export async function deleteCode(c: Context) {
  const code = c.req.param('code')!;

  const existing = await db.getCode(code);
  if (!existing) {
    return c.json({ error: 'Code not found' }, 404);
  }

  const sessions = await db.getSessionsByCode(code);
  for (const session of sessions) {
    await db.deleteSession(session.token);
  }

  await db.deleteCode(code);
  return c.json({ success: true });
}
