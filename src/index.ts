import { Hono } from 'hono';
import { authRoutes } from './routes/auth';

const app = new Hono().basePath('/api');

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/auth', authRoutes);

export default app;
