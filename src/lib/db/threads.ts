import type { Pool } from 'pg';
import type { Thread } from '@/types';
import { mapThread, type Row } from './mappers';

/** Per-aggregate repository for the threads table. */
export interface ThreadsRepo {
  /** Returns every thread, ordered by most recent message first. */
  list(): Promise<Thread[]>;
  /** Returns a single thread by id, or `null` if not found. */
  get(id: string): Promise<Thread | null>;
  /**
   * Returns the thread for a given contact email, or `null` if no thread
   * exists yet. Callers normalise the email (lowercase + trim) before
   * handing it in — the service layer is where that canonicalisation lives.
   */
  getByEmail(email: string): Promise<Thread | null>;
  /** Inserts a new thread record. */
  create(thread: Thread): Promise<Thread>;
  /**
   * Partially updates a thread by id. Returns the updated row, or `null` if
   * the thread was not found. The service uses this to bump
   * `lastMessage*` denormalisations and to zero `unreadCount`.
   */
  update(id: string, data: Omit<Partial<Thread>, 'id'>): Promise<Thread | null>;
  /** Deletes a thread by id. Cascades to messages. Returns `true` if a row was removed. */
  delete(id: string): Promise<boolean>;
}

/**
 * In-memory implementation of {@link ThreadsRepo} backed by a Map. Data
 * resets on process restart — local-dev and unit tests only.
 */
export class InMemoryThreadsRepo implements ThreadsRepo {
  private threads = new Map<string, Thread>();

  /** Clears the repo. Test-only — not on the {@link ThreadsRepo} interface. */
  _reset(): void {
    this.threads.clear();
  }

  /** Returns every thread, ordered by most recent message first. */
  async list(): Promise<Thread[]> {
    return [...this.threads.values()].sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
    );
  }

  /** Returns a single thread by id, or `null` if not found. */
  async get(id: string): Promise<Thread | null> {
    return this.threads.get(id) ?? null;
  }

  /** Returns the thread for a given contact email, or `null` if no thread exists yet. */
  async getByEmail(email: string): Promise<Thread | null> {
    for (const thread of this.threads.values()) {
      if (thread.contactEmail === email) return thread;
    }
    return null;
  }

  /** Inserts a new thread record. */
  async create(thread: Thread): Promise<Thread> {
    this.threads.set(thread.id, thread);
    return thread;
  }

  /** Partially updates a thread by id. Returns the updated row, or `null` if not found. */
  async update(
    id: string,
    data: Omit<Partial<Thread>, 'id'>,
  ): Promise<Thread | null> {
    const existing = this.threads.get(id);
    if (!existing) return null;
    const merged: Thread = { ...existing, ...data, id };
    this.threads.set(id, merged);
    return merged;
  }

  /** Deletes a thread by id. Returns `true` if a row was removed. */
  async delete(id: string): Promise<boolean> {
    return this.threads.delete(id);
  }
}

/** Postgres-backed implementation of {@link ThreadsRepo}. */
export class PostgresThreadsRepo implements ThreadsRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Returns every thread, ordered by most recent message first. */
  async list(): Promise<Thread[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM threads ORDER BY last_message_at DESC',
    );
    return rows.map(mapThread);
  }

  /** Returns a single thread by id, or `null` if not found. */
  async get(id: string): Promise<Thread | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM threads WHERE id = $1', [id]);
    return rows[0] ? mapThread(rows[0]) : null;
  }

  /** Returns the thread for a given contact email, or `null` if no thread exists yet. */
  async getByEmail(email: string): Promise<Thread | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM threads WHERE contact_email = $1',
      [email],
    );
    return rows[0] ? mapThread(rows[0]) : null;
  }

  /** Inserts a new thread record. */
  async create(thread: Thread): Promise<Thread> {
    await this.pool.query(
      `INSERT INTO threads (
         id, contact_email, contact_name, unread_count,
         last_message_at, last_message_preview, last_message_direction, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        thread.id,
        thread.contactEmail,
        thread.contactName,
        thread.unreadCount,
        thread.lastMessageAt,
        thread.lastMessagePreview,
        thread.lastMessageDirection,
        thread.createdAt,
      ],
    );
    return thread;
  }

  /** Partially updates a thread by id. Returns the updated row, or `null` if not found. */
  async update(
    id: string,
    data: Omit<Partial<Thread>, 'id'>,
  ): Promise<Thread | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const merged: Thread = { ...existing, ...data, id };
    await this.pool.query(
      `UPDATE threads SET
         contact_email = $2,
         contact_name = $3,
         unread_count = $4,
         last_message_at = $5,
         last_message_preview = $6,
         last_message_direction = $7
       WHERE id = $1`,
      [
        id,
        merged.contactEmail,
        merged.contactName,
        merged.unreadCount,
        merged.lastMessageAt,
        merged.lastMessagePreview,
        merged.lastMessageDirection,
      ],
    );
    return merged;
  }

  /** Deletes a thread by id. Returns `true` if a row was removed. */
  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM threads WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
