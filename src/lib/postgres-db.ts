import { Pool } from 'pg';
import type { App, User, AccessCode, Session, AccessLog } from '@/types';
import type { DB } from './db';

type Row = Record<string, unknown>;

/**
 * Postgres-backed implementation of the {@link DB} interface.
 * Uses a single `pg.Pool` per instance. Connection details are supplied via
 * a standard postgres URL (e.g. `postgres://user:pass@host:5432/db`).
 */
export class PostgresDB implements DB {
  private pool: Pool;

  /** Creates a new PostgresDB backed by a connection pool against the given URL. */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /** Closes the underlying pool. Call on graceful shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /** Truncates every table. Test-only helper. */
  async _testReset(): Promise<void> {
    await this.pool.query(
      'TRUNCATE access_logs, sessions, access_codes, users, apps RESTART IDENTITY CASCADE',
    );
  }

  // ---- Apps ----

  /** Returns all registered apps. */
  async getApps(): Promise<App[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM apps');
    return rows.map(mapApp);
  }

  /** Returns a single app by ID, or `null` if not found. */
  async getApp(id: string): Promise<App | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM apps WHERE id = $1', [id]);
    return rows[0] ? mapApp(rows[0]) : null;
  }

  /** Returns public metadata (name, icon) for an active app, or `null` if not found or inactive. */
  async getAppMeta(id: string): Promise<{ name: string; iconUrl: string } | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT name, icon_url FROM apps WHERE id = $1 AND active = TRUE',
      [id],
    );
    if (!rows[0]) return null;
    return { name: rows[0].name as string, iconUrl: rows[0].icon_url as string };
  }

  /** Creates a new app record. */
  async createApp(app: App): Promise<App> {
    await this.pool.query(
      'INSERT INTO apps (id, name, url, icon_url, description, active) VALUES ($1, $2, $3, $4, $5, $6)',
      [app.id, app.name, app.url, app.iconUrl, app.description, app.active],
    );
    return app;
  }

  /** Partially updates an app by ID. Returns the updated app, or `null` if not found. */
  async updateApp(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null> {
    const existing = await this.getApp(id);
    if (!existing) return null;
    const merged: App = { ...existing, ...data, id };
    await this.pool.query(
      'UPDATE apps SET name = $2, url = $3, icon_url = $4, description = $5, active = $6 WHERE id = $1',
      [id, merged.name, merged.url, merged.iconUrl, merged.description, merged.active],
    );
    return merged;
  }

  /** Deletes an app by ID. Returns `true` if the app existed. */
  async deleteApp(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM apps WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  // ---- Users ----

  /** Returns all users. */
  async getUsers(): Promise<User[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users');
    return rows.map(mapUser);
  }

  /** Returns a single user by ID, or `null` if not found. */
  async getUser(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  /** Returns a user by their username, or `null` if not found. */
  async getUserByUsername(username: string): Promise<User | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  /** Creates a new user record. */
  async createUser(user: User): Promise<User> {
    await this.pool.query(
      'INSERT INTO users (id, name, type, username, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        user.id,
        user.name,
        user.type,
        user.username ?? null,
        user.passwordHash ?? null,
        user.createdAt,
      ],
    );
    return user;
  }

  /** Partially updates a user by ID. Returns the updated user, or `null` if not found. */
  async updateUser(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null> {
    const existing = await this.getUser(id);
    if (!existing) return null;
    const merged: User = { ...existing, ...data, id };
    await this.pool.query(
      'UPDATE users SET name = $2, type = $3, username = $4, password_hash = $5 WHERE id = $1',
      [id, merged.name, merged.type, merged.username ?? null, merged.passwordHash ?? null],
    );
    return merged;
  }

  /** Deletes a user by ID. Returns `true` if the user existed. */
  async deleteUser(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  // ---- Access Codes ----

  /** Returns all access codes. */
  async getCodes(): Promise<AccessCode[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM access_codes');
    return rows.map(mapCode);
  }

  /** Returns a single access code by its code string, or `null` if not found. */
  async getCode(code: string): Promise<AccessCode | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM access_codes WHERE code = $1', [
      code,
    ]);
    return rows[0] ? mapCode(rows[0]) : null;
  }

  /** Returns all access codes belonging to a specific user. */
  async getCodesByUser(userId: string): Promise<AccessCode[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM access_codes WHERE user_id = $1',
      [userId],
    );
    return rows.map(mapCode);
  }

  /** Creates a new access code record. */
  async createCode(code: AccessCode): Promise<AccessCode> {
    await this.pool.query(
      'INSERT INTO access_codes (code, user_id, app_ids, password_hash, expires_at, created_at, label) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        code.code,
        code.userId,
        code.appIds,
        code.passwordHash,
        code.expiresAt,
        code.createdAt,
        code.label,
      ],
    );
    return code;
  }

  /** Partially updates an access code. Returns the updated code, or `null` if not found. */
  async updateCode(
    code: string,
    data: Omit<Partial<AccessCode>, 'code'>,
  ): Promise<AccessCode | null> {
    const existing = await this.getCode(code);
    if (!existing) return null;
    const merged: AccessCode = { ...existing, ...data, code };
    await this.pool.query(
      'UPDATE access_codes SET user_id = $2, app_ids = $3, password_hash = $4, expires_at = $5, label = $6 WHERE code = $1',
      [code, merged.userId, merged.appIds, merged.passwordHash, merged.expiresAt, merged.label],
    );
    return merged;
  }

  /** Deletes an access code. Returns `true` if the code existed. */
  async deleteCode(code: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM access_codes WHERE code = $1', [
      code,
    ]);
    return (rowCount ?? 0) > 0;
  }

  // ---- Sessions ----

  /** Returns all sessions. */
  async getSessions(): Promise<Session[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions');
    return rows.map(mapSession);
  }

  /** Returns a single session by token, or `null` if not found. */
  async getSession(token: string): Promise<Session | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE token = $1', [
      token,
    ]);
    return rows[0] ? mapSession(rows[0]) : null;
  }

  /** Returns all sessions created from a specific access code. */
  async getSessionsByCode(codeId: string): Promise<Session[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE code_id = $1', [
      codeId,
    ]);
    return rows.map(mapSession);
  }

  /** Returns all sessions belonging to a specific user. */
  async getSessionsByUser(userId: string): Promise<Session[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE user_id = $1', [
      userId,
    ]);
    return rows.map(mapSession);
  }

  /** Creates a new session record. */
  async createSession(session: Session): Promise<Session> {
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
  async updateSession(
    token: string,
    data: Omit<Partial<Session>, 'token'>,
  ): Promise<Session | null> {
    const existing = await this.getSession(token);
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
  async deleteSession(token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    return (rowCount ?? 0) > 0;
  }

  // ---- Access Logs ----

  /** Appends an access log entry. */
  async logAccess(log: AccessLog): Promise<void> {
    await this.pool.query(
      'INSERT INTO access_logs (id, session_token, code_id, app_id, accessed_at, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [log.id, log.sessionToken, log.codeId, log.appId, log.accessedAt, log.userAgent],
    );
  }

  /** Returns access log entries matching the given filters. */
  async getAccessLogs(filters: {
    codeId?: string;
    sessionToken?: string;
    appId?: string;
  }): Promise<AccessLog[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filters.codeId !== undefined) {
      values.push(filters.codeId);
      clauses.push(`code_id = $${values.length}`);
    }
    if (filters.sessionToken !== undefined) {
      values.push(filters.sessionToken);
      clauses.push(`session_token = $${values.length}`);
    }
    if (filters.appId !== undefined) {
      values.push(filters.appId);
      clauses.push(`app_id = $${values.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM access_logs ${where} ORDER BY accessed_at ASC`,
      values,
    );
    return rows.map(mapLog);
  }
}

function mapApp(row: Row): App {
  return {
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    iconUrl: row.icon_url as string,
    description: row.description as string,
    active: row.active as boolean,
  };
}

function mapUser(row: Row): User {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as User['type'],
    username: (row.username as string | null) ?? undefined,
    passwordHash: (row.password_hash as string | null) ?? undefined,
    createdAt: row.created_at as Date,
  };
}

function mapCode(row: Row): AccessCode {
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

function mapSession(row: Row): Session {
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

function mapLog(row: Row): AccessLog {
  return {
    id: row.id as string,
    sessionToken: row.session_token as string,
    codeId: row.code_id as string | null,
    appId: row.app_id as string,
    accessedAt: row.accessed_at as Date,
    userAgent: row.user_agent as string,
  };
}
