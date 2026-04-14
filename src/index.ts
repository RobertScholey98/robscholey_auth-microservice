import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerRoutes } from '@/routes/routes';

const app = new Hono().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = (process.env.ALLOWED_ORIGINS || '').split(',');
      return allowed.includes(origin) ? origin : undefined;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

registerRoutes(app);

export default app;
