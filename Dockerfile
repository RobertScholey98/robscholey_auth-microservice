# syntax=docker/dockerfile:1.7
# Build context: the robscholey.com workspace root (not this repo)

# --- deps: install workspace dependencies ---
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY robscholey_admin/package.json ./robscholey_admin/
COPY robscholey_auth-microservice/package.json ./robscholey_auth-microservice/
COPY robscholey_shell-application/package.json ./robscholey_shell-application/
COPY robscholey_shell-kit/package.json ./robscholey_shell-kit/
COPY robscholey_template-child-nextJS/package.json ./robscholey_template-child-nextJS/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# --- runner: tsx runtime (TODO: migrate to tsc/bundler for a slimmer image) ---
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs hono

COPY --from=deps --chown=hono:nodejs /app ./
COPY --chown=hono:nodejs robscholey_auth-microservice/src ./robscholey_auth-microservice/src
COPY --chown=hono:nodejs robscholey_auth-microservice/migrations ./robscholey_auth-microservice/migrations
COPY --chown=hono:nodejs robscholey_auth-microservice/tsconfig.json ./robscholey_auth-microservice/tsconfig.json

WORKDIR /app/robscholey_auth-microservice
USER hono
EXPOSE 3001

CMD ["pnpm", "start"]
