# syntax=docker/dockerfile:1.7
# Build context: the robscholey.com workspace root (not this repo)

# --- deps: fetch every workspace dep from the lockfile ---
# `pnpm fetch` reads pnpm-lock.yaml alone and hydrates the content-addressed
# store — no per-workspace-package COPY lines are needed here. Adding a new
# workspace package no longer requires editing this Dockerfile.
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN pnpm config set store-dir /pnpm-store
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# --- runner: tsx runtime (TODO: migrate to tsc/bundler for a slimmer image) ---
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN pnpm config set store-dir /pnpm-store
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs hono

COPY --from=deps --chown=hono:nodejs /pnpm-store /pnpm-store

COPY --chown=hono:nodejs pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --chown=hono:nodejs packages/contracts ./packages/contracts
COPY --chown=hono:nodejs robscholey_auth-microservice/package.json ./robscholey_auth-microservice/
COPY --chown=hono:nodejs robscholey_auth-microservice/src ./robscholey_auth-microservice/src
COPY --chown=hono:nodejs robscholey_auth-microservice/migrations ./robscholey_auth-microservice/migrations
COPY --chown=hono:nodejs robscholey_auth-microservice/tsconfig.json ./robscholey_auth-microservice/tsconfig.json
COPY --chown=hono:nodejs appsConfig.json ./appsConfig.json

# --filter narrows install to just the auth service and its workspace deps,
# keeping the image lean (no Next.js deps installed for the Hono service).
RUN pnpm install --offline --frozen-lockfile --filter robscholey-auth-microservice...

ENV APPS_CONFIG_PATH=/app/appsConfig.json

WORKDIR /app/robscholey_auth-microservice
USER hono
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
