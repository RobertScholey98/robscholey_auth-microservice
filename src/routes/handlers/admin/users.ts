import type { Context } from 'hono';
import { createUserSchema, updateUserSchema } from '@robscholey/contracts';
import { userToWire } from '@/lib/wire';
import { services } from '@/services';

/** Lists all users. Strips sensitive fields (passwordHash) from the response. */
export async function listUsers(c: Context) {
  const users = await services.users.list();
  return c.json(users.map(userToWire));
}

/** Creates a named user. Requires `name`. */
export async function createUser(c: Context) {
  const body = createUserSchema.parse(await c.req.json());
  const created = await services.users.create(body);
  return c.json(userToWire(created), 201);
}

/** Partially updates a user by ID. Only `name` can be modified. Returns 404 if not found. */
export async function updateUser(c: Context) {
  const id = c.req.param('id')!;
  const body = updateUserSchema.parse(await c.req.json());
  const updated = await services.users.update(id, body);
  return c.json(userToWire(updated));
}

/** Deletes a user by ID. Cascades to all their access codes and associated sessions. */
export async function deleteUser(c: Context) {
  const id = c.req.param('id')!;
  await services.users.delete(id);
  return c.json({ success: true });
}
