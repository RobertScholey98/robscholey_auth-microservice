import type { Context } from 'hono';
import { db } from '@/lib';
import type { User } from '@/types';

/** Lists all users. */
export async function listUsers(c: Context) {
  return c.json(await db.getUsers());
}

/** Creates a named user. Requires `name`. */
export async function createUser(c: Context) {
  const body = await c.req.json<{ name: string }>();
  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const user: User = {
    id: crypto.randomUUID(),
    name: body.name,
    type: 'named',
    createdAt: new Date(),
  };

  return c.json(await db.createUser(user), 201);
}

/** Partially updates a user by ID. Returns 404 if not found. */
export async function updateUser(c: Context) {
  const id = c.req.param('id')!;
  const body = await c.req.json<Omit<Partial<User>, 'id'>>();

  const updated = await db.updateUser(id, body);
  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(updated);
}

/** Deletes a user by ID. Cascades to all their access codes and associated sessions. */
export async function deleteUser(c: Context) {
  const id = c.req.param('id')!;

  const user = await db.getUser(id);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const codes = await db.getCodesByUser(id);
  for (const code of codes) {
    const sessions = await db.getSessionsByCode(code.code);
    for (const session of sessions) {
      await db.deleteSession(session.token);
    }
    await db.deleteCode(code.code);
  }

  await db.deleteUser(id);
  return c.json({ success: true });
}
