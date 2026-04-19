import type { Context } from 'hono';
import { createUserSchema, updateUserSchema } from '@robscholey/contracts';
import { userToWire } from '@/lib/wire';
import type { Env } from '@/index';

/** Lists all users. Strips sensitive fields (passwordHash) from the response. */
export async function listUsers(c: Context<Env>) {
  const users = await c.get('services').users.list();
  return c.json(users.map(userToWire));
}

/** Creates a named user. Requires `name`. */
export async function createUser(c: Context<Env>) {
  const body = createUserSchema.parse(await c.req.json());
  const created = await c.get('services').users.create(body);
  c.get('logger').info({ event: 'admin.users.create', userId: created.id });
  return c.json(userToWire(created), 201);
}

/** Partially updates a user by ID. Only `name` can be modified. Returns 404 if not found. */
export async function updateUser(c: Context<Env>) {
  const id = c.req.param('id')!;
  const body = updateUserSchema.parse(await c.req.json());
  const updated = await c.get('services').users.update(id, body);
  c.get('logger').info({ event: 'admin.users.update', userId: id });
  return c.json(userToWire(updated));
}

/** Deletes a user by ID. Cascades to all their access codes and associated sessions. */
export async function deleteUser(c: Context<Env>) {
  const id = c.req.param('id')!;
  await c.get('services').users.delete(id);
  c.get('logger').info({ event: 'admin.users.delete', userId: id });
  return c.json({ success: true });
}
