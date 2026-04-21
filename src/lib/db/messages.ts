import type { Pool } from 'pg';
import type { Message } from '@/types';
import { mapMessage, type Row } from './mappers';

/** Per-aggregate repository for the messages table. */
export interface MessagesRepo {
  /**
   * Returns every message on a thread in chronological (oldest-first)
   * order — the order the chat view renders them.
   */
  listByThread(threadId: string): Promise<Message[]>;
  /** Appends a new message. */
  create(message: Message): Promise<Message>;
}

/**
 * In-memory implementation of {@link MessagesRepo} backed by an array.
 * Data resets on process restart — local-dev and unit tests only.
 */
export class InMemoryMessagesRepo implements MessagesRepo {
  private messages: Message[] = [];

  /** Clears the repo. Test-only — not on the {@link MessagesRepo} interface. */
  _reset(): void {
    this.messages = [];
  }

  /** Returns every message on a thread in chronological order. */
  async listByThread(threadId: string): Promise<Message[]> {
    return this.messages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /** Appends a new message. */
  async create(message: Message): Promise<Message> {
    this.messages.push(message);
    return message;
  }
}

/** Postgres-backed implementation of {@link MessagesRepo}. */
export class PostgresMessagesRepo implements MessagesRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Returns every message on a thread in chronological order. */
  async listByThread(threadId: string): Promise<Message[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC',
      [threadId],
    );
    return rows.map(mapMessage);
  }

  /** Appends a new message. */
  async create(message: Message): Promise<Message> {
    await this.pool.query(
      `INSERT INTO messages (id, thread_id, direction, body, session_token, code_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        message.id,
        message.threadId,
        message.direction,
        message.body,
        message.sessionToken,
        message.codeId,
        message.createdAt,
      ],
    );
    return message;
  }
}
