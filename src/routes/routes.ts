import type { Hono } from 'hono';
import type { Env } from '@/index';
import { rateLimit, adminAuth, testOnly } from '@/middleware';

import { setup, login, validateCode, getSession, logout } from './handlers/auth';
import { pokeSession, resetRateLimit } from './handlers/test';
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
  listThreads,
  getThread,
  replyToThread,
  markThreadRead,
} from './handlers/admin';
import { logAccess } from './handlers/logging';
import { getAppMeta, getAppIcon, sendPublicMessage } from './handlers/public';

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
  // Contact-drawer submissions — shares the per-IP rate-limit bucket with
  // /auth/login so a single spammer can't flood the owner's inbox.
  app.post('/public/messages', rateLimit, sendPublicMessage);

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

  //  Threads / messaging — read the thread list, open a chat, reply, mark read.
  //  Inbound sends from the shell contact drawer live on the unauthenticated
  //  /public surface (see below) so anonymous visitors can reach the owner.
  app.get('/admin/threads', listThreads);
  app.get('/admin/threads/:id', getThread);
  app.post('/admin/threads/:id/messages', replyToThread);
  app.post('/admin/threads/:id/read', markThreadRead);

  //  Test-only (404 unless ENABLE_TEST_ENDPOINTS=1). Used by the Playwright
  //  E2E harness to drive presence-transition scenarios without wall-clock
  //  delays — see /e2e/ and src/middleware/testOnly.ts.
  app.post('/admin/test/poke-session', testOnly, pokeSession);

  //  Rate-limit reset sits OUTSIDE /admin/* so it&rsquo;s callable even when
  //  the login bucket is full (admin auth requires a fresh JWT, which needs
  //  a fresh login, which needs rate-limit room — chicken-and-egg).
  app.post('/test/reset-rate-limit', testOnly, resetRateLimit);
}
