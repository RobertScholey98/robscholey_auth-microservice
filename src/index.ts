import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleAppError, type Database } from '@/lib';
import { buildServices, type Services } from '@/services';
import { registerRoutes } from '@/routes/routes';
import type { User } from '@/types';

/**
 * Hono environment type — declares the per-request context variables the app
 * factory attaches to every request. Handlers type their `Context<Env>` to
 * read `c.get('services')` with the correct narrowing. `user` is set by
 * {@link adminAuth} for admin routes only.
 */
export type Env = {
  Variables: {
    services: Services;
    user: User;
  };
};

/**
 * Builds the auth-service Hono app against a given {@link Database}. The
 * service bundle is constructed once per `createApp` call and attached to
 * every request via Hono's context so handlers and middleware pull
 * `c.get('services')` instead of importing a module-level singleton.
 *
 * @param database - The database backing every request through this app.
 * @returns A fully-wired Hono app, ready to be passed to `@hono/node-server`.
 */
export function createApp(database: Database): Hono<Env> {
  const services = buildServices(database);

  const app = new Hono<Env>().basePath('/api');

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
    await next();
  });

  app.onError(handleAppError);

  registerRoutes(app);

  return app;
}
