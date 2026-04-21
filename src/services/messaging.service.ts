import { ErrorCode } from '@robscholey/contracts';
import type {
  SendPublicMessageRequest,
  SendAdminReplyRequest,
} from '@robscholey/contracts';
import { NotFoundError, type Database } from '@/lib';
import type { Thread, Message } from '@/types';

/**
 * Preview length used on thread list rows. Enough to give a sense of the
 * message without leaking the whole body into unrelated views, and short
 * enough that long lines don&rsquo;t push layout around.
 */
const PREVIEW_LENGTH = 120;

/**
 * Normalises a contact email for the unique index on `threads.contact_email`.
 * Lowercase + trim — the same conversation whether someone writes
 * `Alex@Example.com` or `alex@example.com `.
 */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Builds a preview string for {@link Thread.lastMessagePreview}. Collapses
 * whitespace so multi-line bodies stay on one row in the list view.
 */
function toPreview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

/** Shape returned by {@link MessagingService.sendPublic} / {@link MessagingService.sendAdminReply}. */
export interface SendMessageResult {
  /** The thread the message landed on, with denormalised fields already bumped. */
  thread: Thread;
  /** The created message. */
  message: Message;
}

/**
 * Factory for the messaging service. Owns the thread-upsert + message-append
 * flow end-to-end so callers don&rsquo;t have to remember to bump the
 * denormalised fields on `threads`. Emitting SSE events on write is the
 * handler&rsquo;s job — the service stays pure so unit tests don&rsquo;t need
 * to mock an events bus.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns A messaging service bound to `db`.
 */
export function createMessagingService(db: Database) {
  return {
    /** Lists every thread, most recent activity first. */
    async listThreads(): Promise<Thread[]> {
      return db.threads.list();
    },

    /**
     * Loads a thread plus every message on it. Throws
     * {@link NotFoundError} when the thread does not exist.
     *
     * @param id - Thread id from the URL.
     */
    async getThreadDetail(id: string): Promise<{ thread: Thread; messages: Message[] }> {
      const thread = await db.threads.get(id);
      if (!thread) {
        throw new NotFoundError(ErrorCode.AdminThreadNotFound, 'Thread not found');
      }
      const messages = await db.messages.listByThread(id);
      return { thread, messages };
    },

    /**
     * Appends an inbound message from the shell contact drawer. If a thread
     * already exists for the contact email it&rsquo;s reused (contact name
     * gets refreshed) and its `unread_count` bumps; otherwise a fresh thread
     * is created with `unread_count = 1`.
     *
     * @param body - Validated contact payload. `sessionToken` is optional and
     *   only populated when the visitor was already authenticated.
     */
    async sendPublic(body: SendPublicMessageRequest): Promise<SendMessageResult> {
      const email = normaliseEmail(body.email);
      const now = new Date();
      const preview = toPreview(body.body);

      const existing = await db.threads.getByEmail(email);
      const thread = existing
        ? await db.threads.update(existing.id, {
            contactName: body.name,
            unreadCount: existing.unreadCount + 1,
            lastMessageAt: now,
            lastMessagePreview: preview,
            lastMessageDirection: 'in',
          })
        : await db.threads.create({
            id: `thr_${crypto.randomUUID()}`,
            contactEmail: email,
            contactName: body.name,
            unreadCount: 1,
            lastMessageAt: now,
            lastMessagePreview: preview,
            lastMessageDirection: 'in',
            createdAt: now,
          });

      // `update` returns null only when the thread was deleted mid-flight —
      // treating it as a not-found rather than silently dropping the message.
      if (!thread) {
        throw new NotFoundError(ErrorCode.AdminThreadNotFound, 'Thread not found');
      }

      // Resolve codeId from the (optional) session so the message carries
      // session-context without the handler having to fan out.
      let codeId: string | null = null;
      if (body.sessionToken) {
        const session = await db.sessions.get(body.sessionToken);
        if (session) codeId = session.codeId;
      }

      const message = await db.messages.create({
        id: `msg_${crypto.randomUUID()}`,
        threadId: thread.id,
        direction: 'in',
        body: body.body,
        sessionToken: body.sessionToken ?? null,
        codeId,
        createdAt: now,
      });

      return { thread, message };
    },

    /**
     * Appends an outbound reply from the owner. Refreshes the thread&rsquo;s
     * denormalised fields and leaves `unread_count` alone — outbound messages
     * don&rsquo;t mark the thread unread to the owner (they&rsquo;re the
     * sender). Throws {@link NotFoundError} when the thread is unknown.
     *
     * @param threadId - Thread id from the URL.
     * @param body - Validated reply payload.
     */
    async sendAdminReply(
      threadId: string,
      body: SendAdminReplyRequest,
    ): Promise<SendMessageResult> {
      const existing = await db.threads.get(threadId);
      if (!existing) {
        throw new NotFoundError(ErrorCode.AdminThreadNotFound, 'Thread not found');
      }
      const now = new Date();
      const preview = toPreview(body.body);

      const thread = await db.threads.update(threadId, {
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastMessageDirection: 'out',
      });
      if (!thread) {
        throw new NotFoundError(ErrorCode.AdminThreadNotFound, 'Thread not found');
      }

      const message = await db.messages.create({
        id: `msg_${crypto.randomUUID()}`,
        threadId,
        direction: 'out',
        body: body.body,
        sessionToken: null,
        codeId: null,
        createdAt: now,
      });

      return { thread, message };
    },

    /**
     * Zeroes `unread_count` on a thread. Throws {@link NotFoundError} when
     * the thread is unknown.
     *
     * @param threadId - Thread id from the URL.
     */
    async markRead(threadId: string): Promise<Thread> {
      const updated = await db.threads.update(threadId, { unreadCount: 0 });
      if (!updated) {
        throw new NotFoundError(ErrorCode.AdminThreadNotFound, 'Thread not found');
      }
      return updated;
    },
  };
}

/** Public type of the messaging service. */
export type MessagingService = ReturnType<typeof createMessagingService>;
