import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createEventsBus,
  handleAppError,
  type Database,
  type EventsBus,
  type Logger,
} from '@/lib';
import { requestId, requestLogger } from '@/middleware';
import { buildServices, type Services } from '@/services';
import { registerRoutes } from '@/routes/routes';
import type { User } from '@/types';

/**
 * Hono environment type — declares the per-request context variables the app
 * factory attaches to every request. Handlers type their `Context<Env>` to
 * read `c.get('services')` with the correct narrowing. `user` is set by
 * {@link adminAuth} for admin routes only. `requestId` and `logger` are set
 * by the request-id and request-logger middleware and are present on every
 * request. `events` is the in-process pub-sub bus the SSE stream handler
 * subscribes to and domain services will publish into as later phases wire
 * up presence / messaging / audit emitters.
 */
export type Env = {
  Variables: {
    services: Services;
    events: EventsBus;
    user: User;
    requestId: string;
    logger: Logger;
  };
};

/**
 * Builds the auth-service Hono app against a given {@link Database} and root
 * {@link Logger}. The service bundle is constructed once per `createApp` call
 * and attached to every request via Hono's context so handlers and middleware
 * pull `c.get('services')` instead of importing a module-level singleton.
 *
 * Middleware order matters: `requestId` runs first so the logger can bind
 * `requestId` as a child field; `requestLogger` spawns the per-request child;
 * `cors` and service-attach follow; `onError(handleAppError)` is last so the
 * error mapper reads the child logger from context.
 *
 * @param database - The database backing every request through this app.
 * @param logger - Root logger; per-request child loggers derive from this.
 * @returns A fully-wired Hono app, ready to be passed to `@hono/node-server`.
 */
export function createApp(database: Database, logger: Logger): Hono<Env> {
  const events = createEventsBus();
  const services = buildServices(database);

  const app = new Hono<Env>().basePath('/api');

  app.use('*', requestId);
  app.use('*', requestLogger(logger));

  app.use(
    '*',
    cors({
      origin: (origin) => {
        const allowed = (process.env.ALLOWED_ORIGINS || '').split(',');
        return allowed.includes(origin) ? origin : undefined;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use('*', async (c, next) => {
    c.set('services', services);
    c.set('events', events);
    await next();
  });

  app.onError(handleAppError);

  registerRoutes(app);

  return app;
}
