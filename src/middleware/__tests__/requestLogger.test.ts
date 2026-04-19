import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import pino, { type DestinationStream } from 'pino';
import type { Logger } from '@/lib';
import type { Env } from '@/index';
import { requestId } from '../requestId';
import { requestLogger } from '../requestLogger';

interface LogLine {
  level: number;
  event?: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
}

/** Builds a root pino logger whose output is captured line-by-line. */
function captureLogger(): { logger: Logger; lines: () => LogLine[] } {
  const chunks: string[] = [];
  const stream: DestinationStream = {
    write(msg: string) {
      chunks.push(msg);
    },
  };
  const logger: Logger = pino({ level: 'info' }, stream);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as LogLine),
  };
}

describe('requestLogger middleware', () => {
  it('attaches a child logger and emits start/finish with status and duration', async () => {
    const capture = captureLogger();
    const app = new Hono<Env>();
    app.use('*', requestId);
    app.use('*', requestLogger(capture.logger));
    app.get('/ping', (c) => {
      // The handler must be able to read its per-request logger off context.
      expect(typeof c.get('logger').info).toBe('function');
      return c.json({ ok: true });
    });

    const res = await app.request('/ping');
    expect(res.status).toBe(200);

    const events = capture.lines().map((l) => l.event);
    expect(events).toContain('http.request.start');
    expect(events).toContain('http.request.finish');

    const finish = capture.lines().find((l) => l.event === 'http.request.finish');
    expect(finish?.status).toBe(200);
    expect(typeof finish?.durationMs).toBe('number');
    expect(finish?.method).toBe('GET');
    expect(finish?.path).toBe('/ping');
    expect(typeof finish?.requestId).toBe('string');
  });

  it('still emits finish when the handler throws', async () => {
    const capture = captureLogger();
    const app = new Hono<Env>();
    app.use('*', requestId);
    app.use('*', requestLogger(capture.logger));
    app.get('/boom', () => {
      throw new Error('boom');
    });

    await app.request('/boom');

    const events = capture.lines().map((l) => l.event);
    expect(events).toContain('http.request.start');
    expect(events).toContain('http.request.finish');
  });
});
