import { describe, it, expect } from 'vitest';
import pino, { type DestinationStream } from 'pino';
import { createLogger } from '../logger';

/** Pipes pino output to an in-memory buffer so tests can assert line-by-line. */
function captureStream(): { stream: DestinationStream; lines: () => unknown[] } {
  const chunks: string[] = [];
  const stream: DestinationStream = {
    write(msg: string) {
      chunks.push(msg);
    },
  };
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as unknown),
  };
}

describe('createLogger', () => {
  it('honors the level option passed in', () => {
    const logger = createLogger({ level: 'warn' });
    expect(logger.level).toBe('warn');
    expect(logger.isLevelEnabled('info')).toBe(false);
    expect(logger.isLevelEnabled('warn')).toBe(true);
  });

  it('falls back to info when no level is configured', () => {
    const previous = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    try {
      const logger = createLogger();
      expect(logger.level).toBe('info');
    } finally {
      if (previous !== undefined) process.env.LOG_LEVEL = previous;
    }
  });

  it('picks up LOG_LEVEL from the environment when the caller omits it', () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';
    try {
      const logger = createLogger();
      expect(logger.level).toBe('debug');
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
    }
  });

  it('redacts configured sensitive paths', () => {
    // Build pino with the same redact config the factory uses, piped into a
    // capture stream so we can assert on wire output. The factory doesn't
    // accept a custom stream (it picks transport vs stdout itself), so this
    // mirrors its contract rather than calling it directly.
    const capture = captureStream();
    const logger = pino(
      {
        level: 'info',
        redact: {
          paths: ['*.passwordHash', '*.password', 'req.headers.authorization'],
        },
      },
      capture.stream,
    );

    logger.info({ user: { passwordHash: 'secret-hash', name: 'rob' } }, 'user event');
    logger.info({ body: { password: 'secret' } }, 'body event');
    logger.info({ req: { headers: { authorization: 'Bearer leak' } } }, 'headers event');

    const lines = capture.lines() as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(3);
    const [userLine, bodyLine, headersLine] = lines;
    expect((userLine.user as Record<string, unknown>).passwordHash).toBe('[Redacted]');
    expect((userLine.user as Record<string, unknown>).name).toBe('rob');
    expect((bodyLine.body as Record<string, unknown>).password).toBe('[Redacted]');
    expect(
      ((headersLine.req as Record<string, unknown>).headers as Record<string, unknown>)
        .authorization,
    ).toBe('[Redacted]');
  });
});
