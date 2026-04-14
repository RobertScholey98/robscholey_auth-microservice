import { serve } from '@hono/node-server';
import app from './index';

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Auth service running at http://localhost:${info.port}`);
});
