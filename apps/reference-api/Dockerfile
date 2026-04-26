FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docs/api ./docs/api
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY apps/reference-api ./apps/reference-api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @stynx/reference-api... build

EXPOSE 3000

CMD ["sh", "-lc", "cd /app/apps/reference-api && node dist/apps/reference-api/src/main.js"]
