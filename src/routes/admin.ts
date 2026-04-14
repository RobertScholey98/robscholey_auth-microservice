import { Hono } from 'hono';
import { db } from '../lib/db';
import { adminAuth } from '../middleware/adminAuth';
import type { App } from '../types';

const admin = new Hono();

admin.use('*', adminAuth);

// GET /admin/apps — list all apps
admin.get('/apps', async (c) => {
  return c.json(await db.getApps());
});

// POST /admin/apps — create app
admin.post('/apps', async (c) => {
  const body = await c.req.json<Omit<App, 'active'> & { active?: boolean }>();
  if (!body.id || !body.name || !body.url) {
    return c.json({ error: 'id, name, and url are required' }, 400);
  }

  const existing = await db.getApp(body.id);
  if (existing) {
    return c.json({ error: 'App with this id already exists' }, 409);
  }

  const app: App = {
    id: body.id,
    name: body.name,
    url: body.url,
    iconUrl: body.iconUrl || '',
    description: body.description || '',
    active: body.active ?? true,
  };

  return c.json(await db.createApp(app), 201);
});

// PUT /admin/apps/:id — update app
admin.put('/apps/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Omit<Partial<App>, 'id'>>();

  const updated = await db.updateApp(id, body);
  if (!updated) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json(updated);
});

// DELETE /admin/apps/:id — delete app
admin.delete('/apps/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.deleteApp(id);
  if (!deleted) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json({ success: true });
});

export { admin as adminRoutes };
