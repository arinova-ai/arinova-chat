# Stage 1: Install dependencies
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-sdk/package.json ./packages/agent-sdk/
COPY packages/app-sdk/package.json ./packages/app-sdk/
COPY packages/game-sdk/package.json ./packages/game-sdk/
COPY packages/openclaw-plugin/package.json ./packages/openclaw-plugin/
COPY packages/openclaw-office-plugin/package.json ./packages/openclaw-office-plugin/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# NEXT_PUBLIC_ vars must be set at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build (turbo will build shared first, then web)
RUN pnpm --filter @arinova/web build

# Stage 3: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3500

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3500

CMD ["node", "apps/web/server.js"]
