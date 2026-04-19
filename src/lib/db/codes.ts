import type { Pool } from 'pg';
import type { AccessCode } from '@/types';
import { mapCode, type Row } from './mappers';

/** Per-aggregate repository for the access_codes table. */
export interface CodesRepo {
  /** Returns all access codes. */
  list(): Promise<AccessCode[]>;
  /** Returns a single access code by its code string, or `null` if not found. */
  get(code: string): Promise<AccessCode | null>;
  /** Returns all access codes belonging to a specific user. */
  getByUser(userId: string): Promise<AccessCode[]>;
  /** Creates a new access code record. */
  create(code: AccessCode): Promise<AccessCode>;
  /** Partially updates an access code. Returns the updated code, or `null` if not found. */
  update(code: string, data: Omit<Partial<AccessCode>, 'code'>): Promise<AccessCode | null>;
  /** Deletes an access code. Returns `true` if the code existed. */
  delete(code: string): Promise<boolean>;
}

/**
 * In-memory implementation of {@link CodesRepo} backed by a Map.
 * Data resets on process restart — local-dev only.
 */
export class InMemoryCodesRepo implements CodesRepo {
  private codes = new Map<string, AccessCode>();

  /** Clears the repo. Test-only — not on the {@link CodesRepo} interface. */
  _reset(): void {
    this.codes.clear();
  }

  /** Returns all access codes. */
  async list(): Promise<AccessCode[]> {
    return [...this.codes.values()];
  }

  /** Returns a single access code by its code string, or `null` if not found. */
  async get(code: string): Promise<AccessCode | null> {
    return this.codes.get(code) ?? null;
  }

  /** Returns all access codes belonging to a specific user. */
  async getByUser(userId: string): Promise<AccessCode[]> {
    return [...this.codes.values()].filter((c) => c.userId === userId);
  }

  /** Creates a new access code record. */
  async create(code: AccessCode): Promise<AccessCode> {
    this.codes.set(code.code, code);
    return code;
  }

  /** Partially updates an access code. Returns the updated code, or `null` if not found. */
  async update(
    code: string,
    data: Omit<Partial<AccessCode>, 'code'>,
  ): Promise<AccessCode | null> {
    const existing = this.codes.get(code);
    if (!existing) return null;
    const updated = { ...existing, ...data, code };
    this.codes.set(code, updated);
    return updated;
  }

  /** Deletes an access code. Returns `true` if the code existed. */
  async delete(code: string): Promise<boolean> {
    return this.codes.delete(code);
  }
}

/** Postgres-backed implementation of {@link CodesRepo}. */
export class PostgresCodesRepo implements CodesRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Returns all access codes. */
  async list(): Promise<AccessCode[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM access_codes');
    return rows.map(mapCode);
  }

  /** Returns a single access code by its code string, or `null` if not found. */
  async get(code: string): Promise<AccessCode | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM access_codes WHERE code = $1', [
      code,
    ]);
    return rows[0] ? mapCode(rows[0]) : null;
  }

  /** Returns all access codes belonging to a specific user. */
  async getByUser(userId: string): Promise<AccessCode[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM access_codes WHERE user_id = $1',
      [userId],
    );
    return rows.map(mapCode);
  }

  /** Creates a new access code record. */
  async create(code: AccessCode): Promise<AccessCode> {
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
  async update(
    code: string,
    data: Omit<Partial<AccessCode>, 'code'>,
  ): Promise<AccessCode | null> {
    const existing = await this.get(code);
    if (!existing) return null;
    const merged: AccessCode = { ...existing, ...data, code };
    await this.pool.query(
      'UPDATE access_codes SET user_id = $2, app_ids = $3, password_hash = $4, expires_at = $5, label = $6 WHERE code = $1',
      [code, merged.userId, merged.appIds, merged.passwordHash, merged.expiresAt, merged.label],
    );
    return merged;
  }

  /** Deletes an access code. Returns `true` if the code existed. */
  async delete(code: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM access_codes WHERE code = $1', [
      code,
    ]);
    return (rowCount ?? 0) > 0;
  }
}
