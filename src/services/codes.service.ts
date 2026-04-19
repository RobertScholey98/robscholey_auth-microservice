import { ErrorCode } from '@robscholey/contracts';
import type { CreateCodeRequest, UpdateCodeRequest } from '@robscholey/contracts';
import { ConflictError, hashPassword, NotFoundError, type Database } from '@/lib';
import type { AccessCode } from '@/types';

/** Length of the auto-generated portion of an access code. */
const CODE_STRING_LENGTH = 5;

/** One second in milliseconds — used when converting `expiresIn` seconds to an absolute date. */
const MS_PER_SECOND = 1000;

/** Character set for {@link generateCodeString} — visually ambiguous chars (0/O/1/I/L) excluded. */
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a short alphanumeric access code string.
 * @returns A 5-character uppercase code, e.g. `"XK7F2"`.
 */
function generateCodeString(): string {
  const bytes = new Uint8Array(CODE_STRING_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_STRING_LENGTH; i++) {
    code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return code;
}

/**
 * Factory for the codes service. Wraps the codes repo but owns two
 * cross-aggregate flows: on create, a `userName` request creates a named
 * user inline; on delete, sessions issued from the code are cascaded.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns A codes service bound to `db`.
 */
export function createCodesService(db: Database) {
  return {
    /** Returns all access codes. */
    async list(): Promise<AccessCode[]> {
      return db.codes.list();
    },

    /**
     * Returns an access code by its string. Throws {@link NotFoundError} if
     * not found.
     * @param code - Access code string.
     */
    async get(code: string): Promise<AccessCode> {
      const found = await db.codes.get(code);
      if (!found) {
        throw new NotFoundError(ErrorCode.AdminCodeNotFound, 'Code not found');
      }
      return found;
    },

    /**
     * Creates a new access code. Resolves the owning user from `userId`
     * (must exist) or `userName` (created inline as a named user). Generates
     * the code string when blank. Throws {@link ConflictError} on duplicate
     * code and {@link NotFoundError} for a missing `userId`.
     *
     * Conflict and user-lookup checks run before any inline user creation so
     * a failed `userName`-path call never orphans a freshly-minted user.
     *
     * @param body - Validated request body.
     */
    async create(body: CreateCodeRequest): Promise<AccessCode> {
      const codeString = body.code ?? generateCodeString();

      const existing = await db.codes.get(codeString);
      if (existing) {
        throw new ConflictError(ErrorCode.AdminCodeConflict, 'Code already exists');
      }

      let userId: string | null = null;
      if (body.userId) {
        const user = await db.users.get(body.userId);
        if (!user) {
          throw new NotFoundError(ErrorCode.AdminUserNotFound, 'User not found');
        }
        userId = user.id;
      } else if (body.userName) {
        const created = await db.users.create({
          id: crypto.randomUUID(),
          name: body.userName,
          type: 'named',
          createdAt: new Date(),
        });
        userId = created.id;
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

      return db.codes.create(accessCode);
    },

    /**
     * Partially updates an access code. Only `appIds`, `label`, and
     * `expiresAt` are mutable. Throws {@link NotFoundError} if the code
     * does not exist.
     * @param code - Access code string.
     * @param body - Validated request body.
     */
    async update(code: string, body: UpdateCodeRequest): Promise<AccessCode> {
      const data: Omit<Partial<AccessCode>, 'code'> = {};
      if (body.appIds !== undefined) data.appIds = body.appIds;
      if (body.label !== undefined) data.label = body.label;
      if (body.expiresAt !== undefined)
        data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

      const updated = await db.codes.update(code, data);
      if (!updated) {
        throw new NotFoundError(ErrorCode.AdminCodeNotFound, 'Code not found');
      }
      return updated;
    },

    /**
     * Revokes an access code and cascades to every session created from it.
     * Throws {@link NotFoundError} if the code does not exist.
     * @param code - Access code string to revoke.
     */
    async delete(code: string): Promise<void> {
      const existing = await db.codes.get(code);
      if (!existing) {
        throw new NotFoundError(ErrorCode.AdminCodeNotFound, 'Code not found');
      }

      const sessions = await db.sessions.getByCode(code);
      for (const session of sessions) {
        await db.sessions.delete(session.token);
      }

      await db.codes.delete(code);
    },
  };
}

/** Public type of the codes service. */
export type CodesService = ReturnType<typeof createCodesService>;
