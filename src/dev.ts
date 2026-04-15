import { serve } from '@hono/node-server';
import app from './index';
import { seed } from './seed';

serve({ fetch: app.fetch, port: 3001 }, async (info) => {
  console.log(`Auth service running at http://localhost:${info.port}`);
  await seed();
});
