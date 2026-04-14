# robscholey_auth-microservice

Authentication and access control microservice for robscholey.com. Built with [Hono](https://hono.dev) for deployment on Vercel Edge Functions.

## Local Development

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Runs on [http://localhost:3001](http://localhost:3001). Health check at [http://localhost:3001/api/health](http://localhost:3001/api/health).
