FROM node:22-alpine AS base

# 1. Install dependencies
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Build / codegen
FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm run codegen

# 3. Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 ponder
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN chown -R ponder:nodejs /app

COPY --from=builder --chown=ponder:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=ponder:nodejs /app/package.json ./package.json
COPY --from=builder --chown=ponder:nodejs /app/config ./config
COPY --from=builder --chown=ponder:nodejs /app/ponder.config.ts ./ponder.config.ts
COPY --from=builder --chown=ponder:nodejs /app/ponder.schema.ts ./ponder.schema.ts
COPY --from=builder --chown=ponder:nodejs /app/ponder-env.d.ts ./ponder-env.d.ts
COPY --from=builder --chown=ponder:nodejs /app/src ./src
COPY --from=builder --chown=ponder:nodejs /app/scripts ./scripts

RUN chmod +x ./scripts/start.sh

USER ponder

EXPOSE 42069

CMD ["./scripts/start.sh"]
