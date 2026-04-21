import type { Context } from 'hono';
import { sendPublicMessageSchema } from '@robscholey/contracts';
import type { MessageNewEvent, SendPublicMessageResponse } from '@robscholey/contracts';
import { messageToWire, threadToWire } from '@/lib/wire';
import type { Env } from '@/index';

/** One hour in seconds — app icons are served as immutable placeholders today. */
const ICON_CACHE_MAX_AGE = 3600;

/**
 * Renders a placeholder SVG for an app icon — a dark-rounded tile with the
 * first alphanumeric character of the app's name. Pure presentation: SVG is
 * an HTTP output format, not a service concern.
 *
 * @param name - The app's display name.
 * @returns An SVG string ready to return as a response body.
 */
function renderPlaceholderSvg(name: string): string {
  const letter = name
    .charAt(0)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '?');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="32" fill="#1a1a1a"/>
  <text x="96" y="96" font-family="system-ui, sans-serif" font-size="96" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>`;
}

/** Returns public metadata (name, icon URL) for an active app by slug. No auth required. */
export async function getAppMeta(c: Context<Env>) {
  const slug = c.req.param('slug')!;
  return c.json(await c.get('services').public.getAppMeta(slug));
}

/** Serves the app icon for a given slug. Returns a placeholder SVG for now. */
export async function getAppIcon(c: Context<Env>) {
  const slug = c.req.param('slug')!;
  const meta = await c.get('services').public.getAppMeta(slug);
  return c.body(renderPlaceholderSvg(meta.name), 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': `public, max-age=${ICON_CACHE_MAX_AGE}`,
  });
}

/**
 * `POST /public/messages` — inbound contact-drawer submission. Validates the
 * payload, upserts the thread by email, appends the inbound message, and
 * fans the write out as a `message-new` event so any live admin tab sees it
 * without a poll. The route is rate-limited at the middleware layer to keep
 * the contact form from being spammed.
 */
export async function sendPublicMessage(c: Context<Env>) {
  const body = sendPublicMessageSchema.parse(await c.req.json());
  const { thread, message } = await c.get('services').messaging.sendPublic(body);

  const event: MessageNewEvent = {
    type: 'message-new',
    message: messageToWire(message),
    thread: threadToWire(thread),
  };
  c.get('events').emit(event);

  c.get('logger').info(
    {
      event: 'public.messages.send',
      threadId: thread.id,
      messageId: message.id,
      contactEmail: thread.contactEmail,
    },
    'inbound message',
  );

  const response: SendPublicMessageResponse = {
    threadId: thread.id,
    messageId: message.id,
  };
  return c.json(response, 201);
}
