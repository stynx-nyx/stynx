FROM node:24-bookworm-slim AS workspace

WORKDIR /app

ARG PNPM_VERSION=9.15.0

ENV CI=true \
  HUSKY=0

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY docs/api ./docs/api
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY apps/reference-api ./apps/reference-api

FROM workspace AS build

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @stynx/reference-api... build
RUN mkdir -p runtime-dist/apps/reference-api runtime-dist/packages \
  && cp -R apps/reference-api/dist runtime-dist/apps/reference-api/dist \
  && cp -R apps/reference-api/migrations runtime-dist/apps/reference-api/migrations \
  && for package in packages/*; do \
    if [ -d "${package}/dist" ]; then \
      mkdir -p "runtime-dist/${package}"; \
      cp -R "${package}/dist" "runtime-dist/${package}/dist"; \
    fi; \
  done

FROM workspace AS prod-deps

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=prod-deps --chown=node:node /app/apps/reference-api ./apps/reference-api
COPY --from=build --chown=node:node /app/runtime-dist/packages ./packages
COPY --from=build --chown=node:node /app/runtime-dist/apps/reference-api ./apps/reference-api

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

EXPOSE 3000

USER node

CMD ["node", "apps/reference-api/dist/apps/reference-api/src/main.js"]
