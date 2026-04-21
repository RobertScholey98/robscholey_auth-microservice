import type { App, User, AccessCode, Session, AccessLog } from '@/types';

/** Opaque postgres row shape. Mappers narrow each column by name + type. */
export type Row = Record<string, unknown>;

/**
 * Maps a `SELECT * FROM apps` row to the domain {@link App} type. Nullable
 * metadata columns (`version`, `last_updated_at`, `status_variant`,
 * `visual_key`) collapse to `undefined` on the domain side — optional on the
 * type, absent on the wire.
 * @param row - Raw Postgres row.
 * @returns The domain app record.
 */
export function mapApp(row: Row): App {
  const version = (row.version as string | null) ?? undefined;
  const lastUpdatedAt = (row.last_updated_at as Date | null) ?? undefined;
  const statusVariant = (row.status_variant as App['statusVariant'] | null) ?? undefined;
  const visualKey = (row.visual_key as string | null) ?? undefined;
  return {
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    iconUrl: row.icon_url as string,
    description: row.description as string,
    active: row.active as boolean,
    ...(version !== undefined ? { version } : {}),
    ...(lastUpdatedAt !== undefined ? { lastUpdatedAt } : {}),
    ...(statusVariant !== undefined ? { statusVariant } : {}),
    ...(visualKey !== undefined ? { visualKey } : {}),
  };
}

/**
 * Maps a `SELECT * FROM users` row to the domain {@link User} type.
 * Nullable username/passwordHash columns become `undefined` on the domain side.
 * @param row - Raw Postgres row.
 * @returns The domain user record.
 */
export function mapUser(row: Row): User {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as User['type'],
    username: (row.username as string | null) ?? undefined,
    passwordHash: (row.password_hash as string | null) ?? undefined,
    createdAt: row.created_at as Date,
  };
}

/**
 * Maps a `SELECT * FROM access_codes` row to the domain {@link AccessCode} type.
 * @param row - Raw Postgres row.
 * @returns The domain access-code record.
 */
export function mapCode(row: Row): AccessCode {
  return {
    code: row.code as string,
    userId: row.user_id as string | null,
    appIds: row.app_ids as string[],
    passwordHash: row.password_hash as string | null,
    expiresAt: row.expires_at as Date | null,
    createdAt: row.created_at as Date,
    label: row.label as string,
  };
}

/**
 * Maps a `SELECT * FROM sessions` row to the domain {@link Session} type.
 * @param row - Raw Postgres row.
 * @returns The domain session record.
 */
export function mapSession(row: Row): Session {
  return {
    token: row.token as string,
    codeId: row.code_id as string | null,
    userId: row.user_id as string | null,
    appIds: row.app_ids as string[],
    createdAt: row.created_at as Date,
    lastActiveAt: row.last_active_at as Date,
    expiresAt: row.expires_at as Date,
  };
}

/**
 * Maps a `SELECT * FROM access_logs` row to the domain {@link AccessLog} type.
 * @param row - Raw Postgres row.
 * @returns The domain access-log record.
 */
export function mapLog(row: Row): AccessLog {
  return {
    id: row.id as string,
    sessionToken: row.session_token as string,
    codeId: row.code_id as string | null,
    appId: row.app_id as string,
    accessedAt: row.accessed_at as Date,
    userAgent: row.user_agent as string,
  };
}
