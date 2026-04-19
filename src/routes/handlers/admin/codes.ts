import type { Context } from 'hono';
import { createCodeSchema, updateCodeSchema, ErrorCode } from '@robscholey/contracts';
import { db, hashPassword, ConflictError, NotFoundError } from '@/lib';
import type { AccessCode } from '@/types';
import { accessCodeToWire } from '@/lib/wire';

/** Length of the auto-generated portion of an access code. */
const CODE_STRING_LENGTH = 5;

/** One second in milliseconds — used when converting `expiresIn` seconds to an absolute date. */
const MS_PER_SECOND = 1000;

/**
 * Generates a short alphanumeric access code string.
 * Excludes visually ambiguous characters (0, O, 1, I, L).
 * @returns A 5-character uppercase code, e.g. `"XK7F2"`.
 */
function generateCodeString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(CODE_STRING_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_STRING_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Lists all access codes. Strips sensitive fields (passwordHash) from the response. */
export async function listCodes(c: Context) {
  const codes = await db.getCodes();
  return c.json(codes.map(accessCodeToWire));
}

/**
 * Creates a new access code. Body is validated by `createCodeSchema` —
 * `appIds` must be non-empty, and `userId`/`userName` are mutually exclusive.
 *
 * The `code` string is optional: auto-generated when blank, used as-is when
 * provided (409 if a code with that string already exists).
 *
 * Password, if provided, makes the code private and is hashed.
 * `expiresIn` (seconds) is converted to an absolute `expiresAt` date.
 */
export async function createCode(c: Context) {
  const body = createCodeSchema.parse(await c.req.json());

  let userId: string | null = null;
  if (body.userId) {
    const user = await db.getUser(body.userId);
    if (!user) {
      throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
    }
    userId = user.id;
  } else if (body.userName) {
    const created = await db.createUser({
      id: crypto.randomUUID(),
      name: body.userName,
      type: 'named',
      createdAt: new Date(),
    });
    userId = created.id;
  }

  const codeString = body.code ?? generateCodeString();

  const existing = await db.getCode(codeString);
  if (existing) {
    throw new ConflictError(ErrorCode.AdminCodeConflict, 'Code already exists');
  }

  const accessCode: AccessCode = {
    code: codeString,
    userId,
    appIds: body.appIds,
    passwordHash: body.password ? await hashPassword(body.password) : null,
    expiresAt: body.expiresIn ? new Date(Date.now() + body.expiresIn * MS_PER_SECOND) : null,
    createdAt: new Date(),
    label: body.label ?? '',
  };

  return c.json(accessCodeToWire(await db.createCode(accessCode)), 201);
}

/** Partially updates an access code. Only `appIds`, `label`, and `expiresAt` can be modified. */
export async function updateCode(c: Context) {
  const code = c.req.param('code')!;
  const body = updateCodeSchema.parse(await c.req.json());

  const data: Omit<Partial<AccessCode>, 'code'> = {};
  if (body.appIds !== undefined) data.appIds = body.appIds;
  if (body.label !== undefined) data.label = body.label;
  if (body.expiresAt !== undefined)
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const updated = await db.updateCode(code, data);
  if (!updated) {
    throw new NotFoundError(ErrorCode.AdminCodeNotFound, 'Code not found');
  }

  return c.json(accessCodeToWire(updated));
}

/** Revokes an access code. Cascades to all sessions created from this code. */
export async function deleteCode(c: Context) {
  const code = c.req.param('code')!;

  const existing = await db.getCode(code);
  if (!existing) {
    throw new NotFoundError(ErrorCode.AdminCodeNotFound, 'Code not found');
  }

  const sessions = await db.getSessionsByCode(code);
  for (const session of sessions) {
    await db.deleteSession(session.token);
  }

  await db.deleteCode(code);
  return c.json({ success: true });
}
