FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY apps/reference-web ./apps/reference-web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @stynx/reference-web build:web

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/reference-web ./apps/reference-web
ENV PORT=3100
EXPOSE 3100
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
CMD ["node", "apps/reference-web/scripts/serve-static.mjs"]
