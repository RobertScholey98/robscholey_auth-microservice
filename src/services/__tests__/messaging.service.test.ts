import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCode } from '@robscholey/contracts';
import { InMemoryDatabase } from '@/lib/db';
import { createMessagingService, type MessagingService } from '../messaging.service';

let db: InMemoryDatabase;
let service: MessagingService;

beforeEach(() => {
  db = new InMemoryDatabase();
  service = createMessagingService(db);
});

describe('messaging.service.sendPublic', () => {
  it('creates a fresh thread on first contact with unreadCount 1', async () => {
    const { thread, message } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi rob',
    });

    expect(thread.id).toMatch(/^thr_/);
    expect(thread.unreadCount).toBe(1);
    expect(thread.lastMessageDirection).toBe('in');
    expect(thread.lastMessagePreview).toBe('hi rob');
    expect(thread.contactEmail).toBe('alex@example.com');
    expect(thread.contactName).toBe('Alex');
    expect(message.threadId).toBe(thread.id);
    expect(message.direction).toBe('in');
    expect(message.body).toBe('hi rob');
    expect(message.sessionToken).toBeNull();
  });

  it('reuses the thread for a repeat sender and bumps unreadCount', async () => {
    const first = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi rob',
    });
    const second = await service.sendPublic({
      name: 'Alex Smith',
      email: 'alex@example.com',
      body: 'still curious',
    });

    expect(second.thread.id).toBe(first.thread.id);
    expect(second.thread.unreadCount).toBe(2);
    expect(second.thread.contactName).toBe('Alex Smith');
    expect(second.thread.lastMessagePreview).toBe('still curious');

    const messages = await db.messages.listByThread(first.thread.id);
    expect(messages).toHaveLength(2);
  });

  it('normalises email casing + whitespace so repeat contacts match', async () => {
    await service.sendPublic({ name: 'Alex', email: 'Alex@Example.com', body: 'hi' });
    const { thread } = await service.sendPublic({
      name: 'Alex',
      email: '  alex@example.com  ',
      body: 'again',
    });
    expect(thread.unreadCount).toBe(2);
  });

  it('collapses multi-line bodies into a single-line preview', async () => {
    const { thread } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'line one\n\nline two',
    });
    expect(thread.lastMessagePreview).toBe('line one line two');
  });

  it('truncates long previews with an ellipsis', async () => {
    const body = 'x'.repeat(500);
    const { thread } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body,
    });
    expect(thread.lastMessagePreview).toMatch(/…$/);
    expect(thread.lastMessagePreview.length).toBeLessThanOrEqual(120);
  });

  it('attaches the session codeId when sessionToken resolves', async () => {
    await db.sessions.create({
      token: 'sess_alex',
      codeId: 'XK7F2',
      userId: null,
      appIds: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { message } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi',
      sessionToken: 'sess_alex',
    });
    expect(message.sessionToken).toBe('sess_alex');
    expect(message.codeId).toBe('XK7F2');
  });

  it('silently drops an unknown sessionToken — no lookup error, just null codeId', async () => {
    const { message } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi',
      sessionToken: 'sess_unknown',
    });
    expect(message.sessionToken).toBe('sess_unknown');
    expect(message.codeId).toBeNull();
  });
});

describe('messaging.service.sendAdminReply', () => {
  it('appends an outbound message and refreshes preview / direction', async () => {
    const inbound = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi rob',
    });

    const reply = await service.sendAdminReply(inbound.thread.id, { body: 'thanks!' });
    expect(reply.message.direction).toBe('out');
    expect(reply.thread.lastMessagePreview).toBe('thanks!');
    expect(reply.thread.lastMessageDirection).toBe('out');
    // Unread is unchanged — replies don't mark the thread unread to the owner.
    expect(reply.thread.unreadCount).toBe(inbound.thread.unreadCount);
  });

  it('404s for an unknown thread', async () => {
    await expect(
      service.sendAdminReply('thr_nope', { body: 'hi' }),
    ).rejects.toMatchObject({
      code: ErrorCode.AdminThreadNotFound,
      status: 404,
    });
  });
});

describe('messaging.service.markRead', () => {
  it('zeroes unreadCount', async () => {
    const { thread } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'hi',
    });
    const updated = await service.markRead(thread.id);
    expect(updated.unreadCount).toBe(0);
  });

  it('404s for an unknown thread', async () => {
    await expect(service.markRead('thr_nope')).rejects.toMatchObject({
      code: ErrorCode.AdminThreadNotFound,
      status: 404,
    });
  });
});

describe('messaging.service.getThreadDetail', () => {
  it('returns the thread + messages in chronological order', async () => {
    const { thread } = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'first',
    });
    await service.sendAdminReply(thread.id, { body: 'second' });

    const detail = await service.getThreadDetail(thread.id);
    expect(detail.thread.id).toBe(thread.id);
    expect(detail.messages.map((m) => m.direction)).toEqual(['in', 'out']);
  });

  it('404s for an unknown thread', async () => {
    await expect(service.getThreadDetail('thr_nope')).rejects.toMatchObject({
      code: ErrorCode.AdminThreadNotFound,
      status: 404,
    });
  });
});

describe('messaging.service.listThreads', () => {
  it('orders results most-recent-activity first', async () => {
    const a = await service.sendPublic({
      name: 'Alex',
      email: 'alex@example.com',
      body: 'first',
    });
    const b = await service.sendPublic({
      name: 'Bea',
      email: 'bea@example.com',
      body: 'second',
    });
    // Back-to-back sends can collide on the same millisecond in-test; force
    // an ordering by pushing `b` forward so the list order is deterministic.
    await db.threads.update(b.thread.id, {
      lastMessageAt: new Date(a.thread.lastMessageAt.getTime() + 1_000),
    });

    const list = await service.listThreads();
    expect(list.map((t) => t.id)).toEqual([b.thread.id, a.thread.id]);
  });
});
