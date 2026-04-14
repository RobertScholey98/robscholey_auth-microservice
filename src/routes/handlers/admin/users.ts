import type { Context } from 'hono';
import { db } from '@/lib';
import type { User } from '@/types';

/** Strips passwordHash from a user object before sending in a response. */
function sanitizeUser({ passwordHash: _passwordHash, ...rest }: User) {
  return rest;
}

/** Lists all users. Strips sensitive fields (passwordHash) from the response. */
export async function listUsers(c: Context) {
  const users = await db.getUsers();
  return c.json(users.map(sanitizeUser));
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

  return c.json(sanitizeUser(await db.createUser(user)), 201);
}

/** Partially updates a user by ID. Only `name` can be modified. Returns 404 if not found. */
export async function updateUser(c: Context) {
  const id = c.req.param('id')!;
  const body = await c.req.json<{ name?: string }>();

  const data: Omit<Partial<User>, 'id'> = {};
  if (body.name !== undefined) data.name = body.name;

  const updated = await db.updateUser(id, data);
  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(sanitizeUser(updated));
}

/** Deletes a user by ID. Cascades to all their access codes and associated sessions. */
export async function deleteUser(c: Context) {
  const id = c.req.param('id')!;

  const user = await db.getUser(id);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Delete sessions directly linked to this user (e.g. owner login sessions with codeId: null)
  const userSessions = await db.getSessionsByUser(id);
  for (const session of userSessions) {
    await db.deleteSession(session.token);
  }

  // Delete codes belonging to this user, and their associated sessions
  const codes = await db.getCodesByUser(id);
  for (const code of codes) {
    const codeSessions = await db.getSessionsByCode(code.code);
    for (const session of codeSessions) {
      await db.deleteSession(session.token);
    }
    await db.deleteCode(code.code);
  }

  await db.deleteUser(id);
  return c.json({ success: true });
}
