import type { Pool } from 'pg';
import type { User } from '@/types';
import { mapUser, type Row } from './mappers';

/** Per-aggregate repository for the users table. */
export interface UsersRepo {
  /** Returns all users. */
  list(): Promise<User[]>;
  /** Returns a single user by ID, or `null` if not found. */
  get(id: string): Promise<User | null>;
  /** Returns a user by their username, or `null` if not found. */
  getByUsername(username: string): Promise<User | null>;
  /** Creates a new user record. */
  create(user: User): Promise<User>;
  /** Partially updates a user by ID. Returns the updated user, or `null` if not found. */
  update(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null>;
  /** Deletes a user by ID. Returns `true` if the user existed. */
  delete(id: string): Promise<boolean>;
}

/**
 * In-memory implementation of {@link UsersRepo} backed by a Map.
 * Data resets on process restart — local-dev only.
 */
export class InMemoryUsersRepo implements UsersRepo {
  private users = new Map<string, User>();

  /** Clears the repo. Test-only — not on the {@link UsersRepo} interface. */
  _reset(): void {
    this.users.clear();
  }

  /** Returns all users. */
  async list(): Promise<User[]> {
    return [...this.users.values()];
  }

  /** Returns a single user by ID, or `null` if not found. */
  async get(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  /** Returns a user by their username, or `null` if not found. */
  async getByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return null;
  }

  /** Creates a new user record. */
  async create(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  /** Partially updates a user by ID. Returns the updated user, or `null` if not found. */
  async update(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data, id };
    this.users.set(id, updated);
    return updated;
  }

  /** Deletes a user by ID. Returns `true` if the user existed. */
  async delete(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
}

/** Postgres-backed implementation of {@link UsersRepo}. */
export class PostgresUsersRepo implements UsersRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Returns all users. */
  async list(): Promise<User[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users');
    return rows.map(mapUser);
  }

  /** Returns a single user by ID, or `null` if not found. */
  async get(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  /** Returns a user by their username, or `null` if not found. */
  async getByUsername(username: string): Promise<User | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  /** Creates a new user record. */
  async create(user: User): Promise<User> {
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
  async update(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const merged: User = { ...existing, ...data, id };
    await this.pool.query(
      'UPDATE users SET name = $2, type = $3, username = $4, password_hash = $5 WHERE id = $1',
      [id, merged.name, merged.type, merged.username ?? null, merged.passwordHash ?? null],
    );
    return merged;
  }

  /** Deletes a user by ID. Returns `true` if the user existed. */
  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
