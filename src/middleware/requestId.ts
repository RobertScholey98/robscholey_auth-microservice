import type { MiddlewareHandler } from 'hono';
import type { Env } from '@/index';

/**
 * Incoming `x-request-id` header values longer than this are discarded and a
 * fresh UUID is generated instead. Keeps log lines bounded and protects
 * structured fields from arbitrarily large client input.
 */
const MAX_REQUEST_ID_LENGTH = 128;

/** Header name used for both the incoming claim and the outgoing mirror. */
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns a stable request identifier to every request. Honors an incoming
 * `x-request-id` header when present, trimmed and length-capped, so an
 * upstream proxy (Caddy, Cloudflare) can correlate logs across services.
 * Falls back to a fresh UUID otherwise. The id is stored on the Hono context
 * and mirrored on the response for the caller.
 */
export const requestId: MiddlewareHandler<Env> = async (c, next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER)?.trim();
  const id =
    incoming && incoming.length > 0 && incoming.length <= MAX_REQUEST_ID_LENGTH
      ? incoming
      : crypto.randomUUID();

  c.set('requestId', id);
  c.header(REQUEST_ID_HEADER, id);
  await next();
};
