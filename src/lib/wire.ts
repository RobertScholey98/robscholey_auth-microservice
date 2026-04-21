import type {
  App as WireApp,
  User as WireUser,
  AccessCode as WireAccessCode,
  Session as WireSession,
  AccessLog as WireAccessLog,
} from '@robscholey/contracts';
import type { App, User, AccessCode, Session, AccessLog } from '@/types';

/**
 * Maps a domain {@link App} to its wire shape. Serialises the optional
 * `lastUpdatedAt` date to ISO 8601 so every downstream consumer sees the
 * same string shape, and forwards the remaining selector-metadata fields
 * as-is when set.
 *
 * @param a - The domain app record.
 * @returns The wire-safe app shape.
 */
export function appToWire(a: App): WireApp {
  return {
    id: a.id,
    name: a.name,
    url: a.url,
    iconUrl: a.iconUrl,
    description: a.description,
    active: a.active,
    ...(a.version !== undefined ? { version: a.version } : {}),
    ...(a.lastUpdatedAt !== undefined ? { lastUpdatedAt: a.lastUpdatedAt.toISOString() } : {}),
    ...(a.statusVariant !== undefined ? { statusVariant: a.statusVariant } : {}),
    ...(a.visualKey !== undefined ? { visualKey: a.visualKey } : {}),
  };
}

/**
 * Maps a domain {@link User} to its wire shape. Strips the `username` and
 * `passwordHash` fields — owner credentials never leave the server — and
 * serialises `createdAt` to an ISO 8601 string.
 *
 * @param u - The domain user record.
 * @returns The wire-safe user shape.
 */
export function userToWire(u: User): WireUser {
  return {
    id: u.id,
    name: u.name,
    type: u.type,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * Maps a domain {@link AccessCode} to its wire shape. Replaces `passwordHash`
 * with the boolean `hasPassword` so clients can render a "requires password"
 * indicator without ever seeing the hash, and serialises both date fields.
 *
 * @param c - The domain access-code record.
 * @returns The wire-safe access-code shape.
 */
export function accessCodeToWire(c: AccessCode): WireAccessCode {
  return {
    code: c.code,
    userId: c.userId,
    appIds: c.appIds,
    hasPassword: c.passwordHash !== null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    label: c.label,
  };
}

/**
 * Maps a domain {@link Session} to its wire shape. Serialises every timestamp
 * field to ISO 8601 strings.
 *
 * @param s - The domain session record.
 * @returns The wire-safe session shape.
 */
export function sessionToWire(s: Session): WireSession {
  return {
    token: s.token,
    codeId: s.codeId,
    userId: s.userId,
    appIds: s.appIds,
    createdAt: s.createdAt.toISOString(),
    lastActiveAt: s.lastActiveAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  };
}

/**
 * Maps a domain {@link AccessLog} to its wire shape. Serialises `accessedAt`
 * to an ISO 8601 string.
 *
 * @param l - The domain access-log record.
 * @returns The wire-safe access-log shape.
 */
export function accessLogToWire(l: AccessLog): WireAccessLog {
  return {
    id: l.id,
    sessionToken: l.sessionToken,
    codeId: l.codeId,
    appId: l.appId,
    accessedAt: l.accessedAt.toISOString(),
    userAgent: l.userAgent,
  };
}
