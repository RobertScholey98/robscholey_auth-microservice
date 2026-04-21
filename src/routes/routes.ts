import type { Hono } from 'hono';
import type { Env } from '@/index';
import { rateLimit, adminAuth } from '@/middleware';

import { setup, login, validateCode, getSession, logout } from './handlers/auth';
import {
  listApps,
  patchAppActive,
  deleteApp,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listCodes,
  createCode,
  updateCode,
  deleteCode,
  listSessions,
  deleteSession,
  getAnalytics,
  getPresence,
  stream,
} from './handlers/admin';
import { logAccess } from './handlers/logging';
import { getAppMeta, getAppIcon } from './handlers/public';

/** Configures all API routes on the given Hono app instance. */
export function registerRoutes(app: Hono<Env>) {
  // Health
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Auth
  app.post('/auth/setup', setup);
  app.post('/auth/login', rateLimit, login);
  app.post('/auth/validate-code', rateLimit, validateCode);
  app.get('/auth/session', getSession);
  app.post('/auth/logout', logout);

  // Public
  app.get('/apps/:slug/meta', getAppMeta);
  app.get('/app-icon/:slug', getAppIcon);

  // Logging
  app.post('/log-access', logAccess);

  /*
    Admin (all routes require owner session)
   */
  //  Middleware
  app.use('/admin/*', adminAuth);

  //  Apps (structural CRUD lives in appsConfig.json; runtime state is active + orphan removal)
  app.get('/admin/apps', listApps);
  app.patch('/admin/apps/:id/active', patchAppActive);
  app.delete('/admin/apps/:id', deleteApp);

  //  Users
  app.get('/admin/users', listUsers);
  app.post('/admin/users', createUser);
  app.put('/admin/users/:id', updateUser);
  app.delete('/admin/users/:id', deleteUser);

  //  Codes
  app.get('/admin/codes', listCodes);
  app.post('/admin/codes', createCode);
  app.put('/admin/codes/:code', updateCode);
  app.delete('/admin/codes/:code', deleteCode);

  //  Sessions
  app.get('/admin/sessions', listSessions);
  app.delete('/admin/sessions/:token', deleteSession);

  //  Analytics
  app.get('/admin/analytics', getAnalytics);

  //  Presence (derived from sessions.last_active_at)
  app.get('/admin/presence', getPresence);

  //  Stream (SSE — JWT accepted on the query string via adminAuth)
  app.get('/admin/stream', stream);
}
