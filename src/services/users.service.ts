import { ErrorCode } from '@robscholey/contracts';
import type { CreateUserRequest, UpdateUserRequest } from '@robscholey/contracts';
import { hashPassword, NotFoundError, type Database } from '@/lib';
import type { User } from '@/types';

/**
 * Factory for the users service. Covers CRUD plus two cross-aggregate
 * operations: the three-level cascade on delete (user → sessions, user →
 * codes → sessions-per-code) and the boot-time owner reconciliation.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns A users service bound to `db`.
 */
export function createUsersService(db: Database) {
  return {
    /** Returns all users. */
    async list(): Promise<User[]> {
      return db.users.list();
    },

    /**
     * Returns a user by ID. Throws {@link NotFoundError} if not found.
     * @param id - User id.
     */
    async get(id: string): Promise<User> {
      const user = await db.users.get(id);
      if (!user) {
        throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
      }
      return user;
    },

    /**
     * Creates a named user.
     * @param body - Validated request body.
     */
    async create(body: CreateUserRequest): Promise<User> {
      const user: User = {
        id: crypto.randomUUID(),
        name: body.name,
        type: 'named',
        createdAt: new Date(),
      };
      return db.users.create(user);
    },

    /**
     * Partially updates a user. Only `name` is mutable. Throws
     * {@link NotFoundError} if the user does not exist.
     * @param id - User id.
     * @param body - Validated request body.
     */
    async update(id: string, body: UpdateUserRequest): Promise<User> {
      const data: Omit<Partial<User>, 'id'> = {};
      if (body.name !== undefined) data.name = body.name;
      const updated = await db.users.update(id, data);
      if (!updated) {
        throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
      }
      return updated;
    },

    /**
     * Deletes a user and cascades: any sessions directly bound to the user,
     * then every access code owned by the user (each with its own
     * session-per-code cascade), then the user itself. Throws
     * {@link NotFoundError} if the user does not exist.
     * @param id - User id.
     */
    async delete(id: string): Promise<void> {
      const user = await db.users.get(id);
      if (!user) {
        throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
      }

      // Direct sessions (e.g. owner login sessions with codeId: null).
      const userSessions = await db.sessions.getByUser(id);
      for (const session of userSessions) {
        await db.sessions.delete(session.token);
      }

      // Codes owned by this user + sessions created from each code.
      const codes = await db.codes.getByUser(id);
      for (const code of codes) {
        const codeSessions = await db.sessions.getByCode(code.code);
        for (const session of codeSessions) {
          await db.sessions.delete(session.token);
        }
        await db.codes.delete(code.code);
      }

      await db.users.delete(id);
    },

    /**
     * Reconciles exactly one owner with the given credentials — creates the
     * owner if none exists, otherwise updates the existing owner's username
     * and password hash. Called on every boot; rotating the owner password
     * is therefore just a config edit + restart.
     *
     * Takes explicit credentials so callers do the env read once at boot
     * rather than relying on the service to reach into `process.env`.
     *
     * @param username - Desired owner username.
     * @param password - Desired owner password (hashed before storage).
     */
    async ensureOwner(username: string, password: string): Promise<void> {
      const users = await db.users.list();
      const existing = users.find((u) => u.type === 'owner');
      const passwordHash = await hashPassword(password);

      if (existing) {
        await db.users.update(existing.id, {
          name: username,
          username,
          passwordHash,
        });
      } else {
        await db.users.create({
          id: crypto.randomUUID(),
          name: username,
          type: 'owner',
          username,
          passwordHash,
          createdAt: new Date(),
        });
      }
    },
  };
}

/** Public type of the users service. */
export type UsersService = ReturnType<typeof createUsersService>;
