# robscholey_auth-microservice

Authentication and access control microservice for [robscholey.com](https://robscholey.com). Built with [Hono](https://hono.dev) for deployment on [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions).

Handles user authentication, server-side sessions, JWT issuance, access code management, app registry, and access logging. The shell application and admin panel consume this API — it has no frontend of its own.

## Local Development

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Runs on [http://localhost:3001](http://localhost:3001). Health check at [http://localhost:3001/api/health](http://localhost:3001/api/health).

### Testing

```bash
pnpm test            # run once
pnpm test:watch      # watch mode
```

## API Endpoints

All endpoints are prefixed with `/api`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Returns `{ status: "ok", timestamp }` |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/setup` | None | One-time owner bootstrap. Sealed after first use. |
| POST | `/auth/login` | None | Owner username/password login. Rate limited. |
| POST | `/auth/validate-code` | None | Validate access code + optional password. Rate limited. |
| GET | `/auth/session` | None | Validate session token (`?token=`), return fresh JWT + apps. |
| POST | `/auth/logout` | None | Invalidate session. |

### Public

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/apps/:slug/meta` | None | App metadata (name, icon URL) for active apps. |
| GET | `/app-icon/:slug` | None | App icon image (placeholder SVG). |

### Logging

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/log-access` | Session | Log an app access event. |

### Admin (all require owner session)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/apps` | List all apps |
| POST | `/admin/apps` | Create app |
| PUT | `/admin/apps/:id` | Update app |
| DELETE | `/admin/apps/:id` | Delete app |
| GET | `/admin/users` | List all users |
| POST | `/admin/users` | Create named user |
| PUT | `/admin/users/:id` | Update user |
| DELETE | `/admin/users/:id` | Delete user (cascades to codes + sessions) |
| GET | `/admin/codes` | List all access codes |
| POST | `/admin/codes` | Generate access code |
| PUT | `/admin/codes/:code` | Update code |
| DELETE | `/admin/codes/:code` | Revoke code (cascades to sessions) |
| GET | `/admin/sessions` | List sessions (`?codeId=` filter) |
| DELETE | `/admin/sessions/:token` | Invalidate session |
| GET | `/admin/analytics` | Access logs + stats (`?codeId=&appId=&from=&to=`) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SESSION_SECRET` | Secret for session management | — |
| `JWT_SIGNING_SECRET` | HMAC secret for JWT signing/verification | — |
| `JWT_EXPIRY` | JWT lifetime in seconds | `3600` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | — |

## Architecture

- **Runtime:** Vercel Edge Functions (via `api/[[...route]].ts` catch-all)
- **Framework:** Hono with `/api` base path
- **JWT:** `jose` (HS256) — Edge-compatible, no Node.js crypto dependency
- **Passwords:** `bcryptjs` — pure JS, no native bindings
- **Sessions:** Server-side, opaque token in cookie. JWT in memory only.
- **Database:** Pluggable `DB` interface. In-memory implementation for dev, swap to Vercel KV/Postgres for production.
- **Rate limiting:** In-memory, 5 attempts/minute on login + code validation.

## Project Structure

```
src/
  index.ts                          — Hono app + CORS
  types/                            — Data model interfaces
  lib/                              — DB, JWT, password, session helpers
  middleware/                       — adminAuth, rateLimit
  routes/
    routes.ts                       — All endpoint definitions
    handlers/
      auth/                         — Setup, login, code validation, session, logout
      admin/                        — App/user/code/session CRUD, analytics
      public/                       — App metadata + icon
      logging/                      — Access logging
api/
  [[...route]].ts                   — Vercel Edge entry point
```
