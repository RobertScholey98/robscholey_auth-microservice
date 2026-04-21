import type { Context } from 'hono';
import { sendAdminReplySchema } from '@robscholey/contracts';
import type { MessageNewEvent, ThreadDetail } from '@robscholey/contracts';
import { messageToWire, threadToWire } from '@/lib/wire';
import type { Env } from '@/index';

/** `GET /admin/threads` — thread list, most recent activity first. */
export async function listThreads(c: Context<Env>) {
  const threads = await c.get('services').messaging.listThreads();
  return c.json(threads.map(threadToWire));
}

/**
 * `GET /admin/threads/:id` — thread plus every message in chronological
 * order. 404 if the thread is unknown.
 */
export async function getThread(c: Context<Env>) {
  const id = c.req.param('id')!;
  const { thread, messages } = await c.get('services').messaging.getThreadDetail(id);
  const body: ThreadDetail = {
    thread: threadToWire(thread),
    messages: messages.map(messageToWire),
  };
  return c.json(body);
}

/**
 * `POST /admin/threads/:id/messages` — append an owner reply. The service
 * bumps the thread&rsquo;s denormalised fields and the handler fans the
 * resulting write out as a `message-new` event so every live admin tab
 * picks it up without a re-fetch.
 */
export async function replyToThread(c: Context<Env>) {
  const id = c.req.param('id')!;
  const body = sendAdminReplySchema.parse(await c.req.json());
  const { thread, message } = await c.get('services').messaging.sendAdminReply(id, body);

  const event: MessageNewEvent = {
    type: 'message-new',
    message: messageToWire(message),
    thread: threadToWire(thread),
  };
  c.get('events').emit(event);

  c.get('logger').info(
    { event: 'admin.threads.reply', threadId: id, messageId: message.id },
    'admin replied',
  );
  return c.json({ success: true }, 201);
}

/**
 * `POST /admin/threads/:id/read` — zeroes the thread&rsquo;s `unreadCount`.
 * No SSE event; the owner just updated themselves.
 */
export async function markThreadRead(c: Context<Env>) {
  const id = c.req.param('id')!;
  await c.get('services').messaging.markRead(id);
  c.get('logger').info({ event: 'admin.threads.read', threadId: id });
  return c.json({ success: true });
}
