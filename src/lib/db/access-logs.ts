import type { Pool } from 'pg';
import type { AccessLog } from '@/types';
import { mapLog, type Row } from './mappers';

/** Filter shape for {@link AccessLogsRepo.query}. An empty object matches all entries. */
export interface AccessLogFilters {
  codeId?: string;
  sessionToken?: string;
  appId?: string;
}

/** Per-aggregate repository for the access_logs table. */
export interface AccessLogsRepo {
  /** Appends an access log entry. */
  append(log: AccessLog): Promise<void>;
  /** Returns access log entries matching the given filters. */
  query(filters: AccessLogFilters): Promise<AccessLog[]>;
}

/**
 * In-memory implementation of {@link AccessLogsRepo} backed by an array.
 * Data resets on process restart — local-dev only.
 */
export class InMemoryAccessLogsRepo implements AccessLogsRepo {
  private logs: AccessLog[] = [];

  /** Clears the repo. Test-only — not on the {@link AccessLogsRepo} interface. */
  _reset(): void {
    this.logs = [];
  }

  /** Appends an access log entry. */
  async append(log: AccessLog): Promise<void> {
    this.logs.push(log);
  }

  /** Returns access log entries matching the given filters. An empty filter object returns all entries. */
  async query(filters: AccessLogFilters): Promise<AccessLog[]> {
    return this.logs.filter((log) => {
      if (filters.codeId && log.codeId !== filters.codeId) return false;
      if (filters.sessionToken && log.sessionToken !== filters.sessionToken) return false;
      if (filters.appId && log.appId !== filters.appId) return false;
      return true;
    });
  }
}

/** Postgres-backed implementation of {@link AccessLogsRepo}. */
export class PostgresAccessLogsRepo implements AccessLogsRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Appends an access log entry. */
  async append(log: AccessLog): Promise<void> {
    await this.pool.query(
      'INSERT INTO access_logs (id, session_token, code_id, app_id, accessed_at, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [log.id, log.sessionToken, log.codeId, log.appId, log.accessedAt, log.userAgent],
    );
  }

  /** Returns access log entries matching the given filters. Ordered ascending by `accessedAt`. */
  async query(filters: AccessLogFilters): Promise<AccessLog[]> {
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
