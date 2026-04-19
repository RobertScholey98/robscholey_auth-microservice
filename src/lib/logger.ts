import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

/**
 * Structured logger used everywhere in the auth service. Aliased from the
 * underlying pino type so services and middleware depend on the shared name
 * rather than reaching into the pino module directly.
 */
export type Logger = PinoLogger;

/** Optional knobs for {@link createLogger}. */
export interface CreateLoggerOptions {
  /** Logger name emitted on every line; used to tag boot-time output. */
  name?: string;
  /** Explicit level override; falls back to `LOG_LEVEL` env var, then `info`. */
  level?: LoggerOptions['level'];
}

/** Default level when neither the caller nor the environment specifies one. */
const DEFAULT_LOG_LEVEL = 'info';

/**
 * Paths redacted from every log line. Covers the handful of sensitive fields
 * that might slip into a merge object if a service accidentally logs a raw
 * user row or an incoming request header. Keep this list minimal — the
 * defence in depth is "don't log raw secrets", not "redact everything".
 */
const REDACT_PATHS: readonly string[] = [
  '*.passwordHash',
  '*.password',
  'req.headers.authorization',
];

/**
 * Builds a root pino logger configured for the current environment.
 *
 * In development the logger is piped through `pino-pretty` for readable
 * console output; in production (and every other `NODE_ENV`) it emits
 * newline-delimited JSON so the container's stdout is machine-parsable.
 *
 * @param opts - Optional `name` and `level` overrides.
 * @returns A configured {@link Logger} instance.
 */
export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL;
  const base: LoggerOptions = {
    level,
    redact: { paths: [...REDACT_PATHS] },
  };
  if (opts.name) {
    base.name = opts.name;
  }

  if (process.env.NODE_ENV === 'development') {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
      },
    });
  }

  return pino(base);
}
