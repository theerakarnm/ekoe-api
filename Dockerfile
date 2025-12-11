FROM oven/bun:1.2-slim AS base

FROM base AS builder

RUN cat /etc/os-release

RUN apt-get update && apt-get install -y libc6
WORKDIR /app

COPY bun.lock package.json tsconfig.json ./
COPY . .

RUN bun add -d typescript

RUN bun install
RUN bun run clean
RUN bun run build

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=hono:nodejs /app/dist /app/dist
# COPY --from=builder --chown=hono:nodejs /app/src/assets /app/dist/assets
COPY --from=builder --chown=hono:nodejs /app/package.json /app/package.json

USER hono
EXPOSE 3000

CMD ["bun", "run", "/app/dist/index.js"]