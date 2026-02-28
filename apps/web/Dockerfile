# Stage 1: Install dependencies
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-sdk/package.json ./packages/agent-sdk/
COPY packages/app-sdk/package.json ./packages/app-sdk/
COPY packages/spaces-sdk/package.json ./packages/spaces-sdk/
COPY packages/openclaw-plugin/package.json ./packages/openclaw-plugin/

# --ignore-scripts: skip mediasoup native build (server-only dep, not needed for web)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# NEXT_PUBLIC_ vars must be set at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy entire workspace from deps (preserves pnpm symlink structure)
COPY --from=deps /app ./

# Overlay source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build (turbo will build shared first, then web)
RUN pnpm --filter @arinova/web build

# Stage 3: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=21000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 21000

CMD ["node", "apps/web/server.js"]
