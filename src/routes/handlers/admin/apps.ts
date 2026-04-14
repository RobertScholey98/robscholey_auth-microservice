import type { Context } from 'hono';
import { db } from '@/lib';
import type { App } from '@/types';

/** Lists all registered apps. */
export async function listApps(c: Context) {
  return c.json(await db.getApps());
}

/** Creates a new app. Requires `id`, `name`, and `url`. Defaults `active` to `true`. */
export async function createApp(c: Context) {
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
}

/** Partially updates an app by ID. Returns 404 if not found. */
export async function updateApp(c: Context) {
  const id = c.req.param('id')!;
  const body = await c.req.json<Omit<Partial<App>, 'id'>>();

  const updated = await db.updateApp(id, body);
  if (!updated) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json(updated);
}

/** Deletes an app by ID. Returns 404 if not found. */
export async function deleteApp(c: Context) {
  const id = c.req.param('id')!;
  const deleted = await db.deleteApp(id);
  if (!deleted) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json({ success: true });
}
