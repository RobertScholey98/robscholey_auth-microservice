import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';

const app = new Hono().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = (process.env.ALLOWED_ORIGINS || '').split(',');
      return allowed.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/auth', authRoutes);
app.route('/admin', adminRoutes);

export default app;
