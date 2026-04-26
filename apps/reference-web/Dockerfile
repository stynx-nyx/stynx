FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY apps/reference-web ./apps/reference-web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @stynx/reference-web build:web

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/apps/reference-web ./apps/reference-web
ENV PORT=3100
EXPOSE 3100
CMD ["node", "apps/reference-web/scripts/serve-static.mjs"]
