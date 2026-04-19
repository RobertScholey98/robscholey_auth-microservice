import type { Context } from 'hono';
import { createUserSchema, updateUserSchema, ErrorCode } from '@robscholey/contracts';
import { db, NotFoundError } from '@/lib';
import type { User } from '@/types';
import { userToWire } from '@/lib/wire';

/** Lists all users. Strips sensitive fields (passwordHash) from the response. */
export async function listUsers(c: Context) {
  const users = await db.getUsers();
  return c.json(users.map(userToWire));
}

/** Creates a named user. Requires `name`. */
export async function createUser(c: Context) {
  const body = createUserSchema.parse(await c.req.json());

  const user: User = {
    id: crypto.randomUUID(),
    name: body.name,
    type: 'named',
    createdAt: new Date(),
  };

  return c.json(userToWire(await db.createUser(user)), 201);
}

/** Partially updates a user by ID. Only `name` can be modified. Returns 404 if not found. */
export async function updateUser(c: Context) {
  const id = c.req.param('id')!;
  const body = updateUserSchema.parse(await c.req.json());

  const data: Omit<Partial<User>, 'id'> = {};
  if (body.name !== undefined) data.name = body.name;

  const updated = await db.updateUser(id, data);
  if (!updated) {
    throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
  }

  return c.json(userToWire(updated));
}

/** Deletes a user by ID. Cascades to all their access codes and associated sessions. */
export async function deleteUser(c: Context) {
  const id = c.req.param('id')!;

  const user = await db.getUser(id);
  if (!user) {
    throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
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
