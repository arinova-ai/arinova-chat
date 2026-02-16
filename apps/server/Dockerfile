# Stage 1: Install dependencies
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Build shared first, then server
RUN pnpm --filter @arinova/server build

# Stage 3: Production runner (prod-only deps)
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace config + lockfile for prod install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/shared ./packages/shared

# Copy drizzle migrations for auto-migrate on startup
COPY apps/server/drizzle ./apps/server/drizzle

# Create uploads directory
RUN mkdir -p /app/apps/server/uploads

EXPOSE 3501

# Run migrations then start server
CMD ["sh", "-c", "cd apps/server && node dist/migrate.js && node dist/index.js"]
