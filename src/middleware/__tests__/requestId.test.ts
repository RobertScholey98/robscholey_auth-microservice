import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '@/index';
import { requestId } from '../requestId';

/** Matches RFC 4122 v4 UUIDs; used to verify the fallback path. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appUnderTest(): Hono<Env> {
  const app = new Hono<Env>();
  app.use('*', requestId);
  app.get('/', (c) => c.json({ id: c.get('requestId') }));
  return app;
}

describe('requestId middleware', () => {
  it('generates a UUID when the incoming header is absent', async () => {
    const res = await appUnderTest().request('/');
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(UUID_V4);
    expect(res.headers.get('x-request-id')).toBe(body.id);
  });

  it('honors an incoming x-request-id header', async () => {
    const res = await appUnderTest().request('/', {
      headers: { 'x-request-id': 'upstream-abc-123' },
    });
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('upstream-abc-123');
    expect(res.headers.get('x-request-id')).toBe('upstream-abc-123');
  });

  it('trims surrounding whitespace on the incoming header', async () => {
    const res = await appUnderTest().request('/', {
      headers: { 'x-request-id': '   trim-me   ' },
    });
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('trim-me');
  });

  it('falls back to a UUID when the incoming header exceeds the length cap', async () => {
    const tooLong = 'x'.repeat(129);
    const res = await appUnderTest().request('/', { headers: { 'x-request-id': tooLong } });
    const body = (await res.json()) as { id: string };
    expect(body.id).not.toBe(tooLong);
    expect(body.id).toMatch(UUID_V4);
  });

  it('falls back to a UUID when the incoming header is empty after trimming', async () => {
    const res = await appUnderTest().request('/', { headers: { 'x-request-id': '   ' } });
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(UUID_V4);
  });

  it('mirrors the request id on the response header', async () => {
    const res = await appUnderTest().request('/', {
      headers: { 'x-request-id': 'mirror-me' },
    });
    expect(res.headers.get('x-request-id')).toBe('mirror-me');
  });
});
