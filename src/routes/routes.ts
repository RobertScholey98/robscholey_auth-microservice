import { Hono } from 'hono';
import { rateLimit, adminAuth } from '@/middleware';

import { setup, login, validateCode, getSession, logout } from './handlers/auth';
import {
  listApps, createApp, updateApp, deleteApp,
  listUsers, createUser, updateUser, deleteUser,
  listCodes, createCode, updateCode, deleteCode,
} from './handlers/admin';

/** Configures all API routes on the given Hono app instance. */
export function registerRoutes(app: Hono) {
  // Health
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Auth
  app.post('/auth/setup', setup);
  app.post('/auth/login', rateLimit, login);
  app.post('/auth/validate-code', rateLimit, validateCode);
  app.get('/auth/session', getSession);
  app.post('/auth/logout', logout);

  /*
    Admin (all routes require owner session)
   */
  //  Middleware
  app.use('/admin/*', adminAuth);

  //  Apps
  app.get('/admin/apps', listApps);
  app.post('/admin/apps', createApp);
  app.put('/admin/apps/:id', updateApp);
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
}
