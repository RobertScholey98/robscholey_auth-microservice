import type { Context } from 'hono';
import { createCodeSchema, updateCodeSchema } from '@robscholey/contracts';
import { accessCodeToWire } from '@/lib/wire';
import type { Env } from '@/index';

/** Lists all access codes. Strips sensitive fields (passwordHash) from the response. */
export async function listCodes(c: Context<Env>) {
  const codes = await c.get('services').codes.list();
  return c.json(codes.map(accessCodeToWire));
}

/**
 * Creates a new access code. Body is validated by `createCodeSchema` —
 * `appIds` must be non-empty, and `userId`/`userName` are mutually exclusive.
 * The `code` string is optional: auto-generated when blank, used as-is when
 * provided (409 on duplicate). Password, if provided, makes the code private.
 * `expiresIn` (seconds) is converted to an absolute `expiresAt` date.
 */
export async function createCode(c: Context<Env>) {
  const body = createCodeSchema.parse(await c.req.json());
  const created = await c.get('services').codes.create(body);
  return c.json(accessCodeToWire(created), 201);
}

/** Partially updates an access code. Only `appIds`, `label`, and `expiresAt` can be modified. */
export async function updateCode(c: Context<Env>) {
  const code = c.req.param('code')!;
  const body = updateCodeSchema.parse(await c.req.json());
  const updated = await c.get('services').codes.update(code, body);
  return c.json(accessCodeToWire(updated));
}

/** Revokes an access code. Cascades to all sessions created from this code. */
export async function deleteCode(c: Context<Env>) {
  const code = c.req.param('code')!;
  await c.get('services').codes.delete(code);
  return c.json({ success: true });
}
