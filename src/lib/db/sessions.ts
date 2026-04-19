import type { Pool } from 'pg';
import type { Session } from '@/types';
import { mapSession, type Row } from './mappers';

/** Per-aggregate repository for the sessions table. */
export interface SessionsRepo {
  /** Returns all sessions. */
  list(): Promise<Session[]>;
  /** Returns a single session by token, or `null` if not found. */
  get(token: string): Promise<Session | null>;
  /** Returns all sessions created from a specific access code. */
  getByCode(codeId: string): Promise<Session[]>;
  /** Returns all sessions belonging to a specific user. */
  getByUser(userId: string): Promise<Session[]>;
  /** Creates a new session record. */
  create(session: Session): Promise<Session>;
  /** Partially updates a session by token. Returns the updated session, or `null` if not found. */
  update(token: string, data: Omit<Partial<Session>, 'token'>): Promise<Session | null>;
  /** Deletes a session by token. Returns `true` if the session existed. */
  delete(token: string): Promise<boolean>;
}

/**
 * In-memory implementation of {@link SessionsRepo} backed by a Map.
 * Data resets on process restart — local-dev only.
 */
export class InMemorySessionsRepo implements SessionsRepo {
  private sessions = new Map<string, Session>();

  /** Clears the repo. Test-only — not on the {@link SessionsRepo} interface. */
  _reset(): void {
    this.sessions.clear();
  }

  /** Returns all sessions. */
  async list(): Promise<Session[]> {
    return [...this.sessions.values()];
  }

  /** Returns a single session by token, or `null` if not found. */
  async get(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  /** Returns all sessions created from a specific access code. */
  async getByCode(codeId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.codeId === codeId);
  }

  /** Returns all sessions belonging to a specific user. */
  async getByUser(userId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  /** Creates a new session record. */
  async create(session: Session): Promise<Session> {
    this.sessions.set(session.token, session);
    return session;
  }

  /** Partially updates a session by token. Returns the updated session, or `null` if not found. */
  async update(
    token: string,
    data: Omit<Partial<Session>, 'token'>,
  ): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    const updated = { ...session, ...data, token };
    this.sessions.set(token, updated);
    return updated;
  }

  /** Deletes a session by token. Returns `true` if the session existed. */
  async delete(token: string): Promise<boolean> {
    return this.sessions.delete(token);
  }
}

/** Postgres-backed implementation of {@link SessionsRepo}. */
export class PostgresSessionsRepo implements SessionsRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Returns all sessions. */
  async list(): Promise<Session[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions');
    return rows.map(mapSession);
  }

  /** Returns a single session by token, or `null` if not found. */
  async get(token: string): Promise<Session | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE token = $1', [
      token,
    ]);
    return rows[0] ? mapSession(rows[0]) : null;
  }

  /** Returns all sessions created from a specific access code. */
  async getByCode(codeId: string): Promise<Session[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE code_id = $1', [
      codeId,
    ]);
    return rows.map(mapSession);
  }

  /** Returns all sessions belonging to a specific user. */
  async getByUser(userId: string): Promise<Session[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE user_id = $1', [
      userId,
    ]);
    return rows.map(mapSession);
  }

  /** Creates a new session record. */
  async create(session: Session): Promise<Session> {
    await this.pool.query(
      'INSERT INTO sessions (token, code_id, user_id, app_ids, created_at, last_active_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        session.token,
        session.codeId,
        session.userId,
        session.appIds,
        session.createdAt,
        session.lastActiveAt,
        session.expiresAt,
      ],
    );
    return session;
  }

  /** Partially updates a session by token. Returns the updated session, or `null` if not found. */
  async update(
    token: string,
    data: Omit<Partial<Session>, 'token'>,
  ): Promise<Session | null> {
    const existing = await this.get(token);
    if (!existing) return null;
    const merged: Session = { ...existing, ...data, token };
    await this.pool.query(
      'UPDATE sessions SET code_id = $2, user_id = $3, app_ids = $4, last_active_at = $5, expires_at = $6 WHERE token = $1',
      [
        token,
        merged.codeId,
        merged.userId,
        merged.appIds,
        merged.lastActiveAt,
        merged.expiresAt,
      ],
    );
    return merged;
  }

  /** Deletes a session by token. Returns `true` if the session existed. */
  async delete(token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    return (rowCount ?? 0) > 0;
  }
}
