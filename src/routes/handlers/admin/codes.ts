import type { Context } from 'hono';
import { createCodeSchema, updateCodeSchema } from '@robscholey/contracts';
import { accessCodeToWire } from '@/lib/wire';
import { services } from '@/services';

/** Lists all access codes. Strips sensitive fields (passwordHash) from the response. */
export async function listCodes(c: Context) {
  const codes = await services.codes.list();
  return c.json(codes.map(accessCodeToWire));
}

/**
 * Creates a new access code. Body is validated by `createCodeSchema` —
 * `appIds` must be non-empty, and `userId`/`userName` are mutually exclusive.
 * The `code` string is optional: auto-generated when blank, used as-is when
 * provided (409 on duplicate). Password, if provided, makes the code private.
 * `expiresIn` (seconds) is converted to an absolute `expiresAt` date.
 */
export async function createCode(c: Context) {
  const body = createCodeSchema.parse(await c.req.json());
  const created = await services.codes.create(body);
  return c.json(accessCodeToWire(created), 201);
}

/** Partially updates an access code. Only `appIds`, `label`, and `expiresAt` can be modified. */
export async function updateCode(c: Context) {
  const code = c.req.param('code')!;
  const body = updateCodeSchema.parse(await c.req.json());
  const updated = await services.codes.update(code, body);
  return c.json(accessCodeToWire(updated));
}

/** Revokes an access code. Cascades to all sessions created from this code. */
export async function deleteCode(c: Context) {
  const code = c.req.param('code')!;
  await services.codes.delete(code);
  return c.json({ success: true });
}
