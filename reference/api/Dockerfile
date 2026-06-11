FROM node:24-bookworm-slim AS workspace

WORKDIR /app

ARG PNPM_VERSION=9.15.0

ENV CI=true \
  HUSKY=0

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY docs/framework/api ./docs/framework/api
COPY docs/framework/contracts ./docs/framework/contracts
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY reference/api ./reference/api

FROM workspace AS build

RUN NODE_OPTIONS=--disable-warning=DEP0169 pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @stynx/reference-api... build
RUN mkdir -p runtime-dist/reference/api runtime-dist/packages \
  && cp -R reference/api/dist runtime-dist/reference/api/dist \
  && cp -R reference/api/migrations runtime-dist/reference/api/migrations \
  && for package in packages/*; do \
    if [ -d "${package}/dist" ]; then \
      mkdir -p "runtime-dist/${package}"; \
      cp -R "${package}/dist" "runtime-dist/${package}/dist"; \
    fi; \
  done

FROM workspace AS prod-deps

RUN NODE_OPTIONS=--disable-warning=DEP0169 pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=prod-deps --chown=node:node /app/reference/api ./reference/api
COPY --from=build --chown=node:node /app/runtime-dist/packages/. ./packages
COPY --from=build --chown=node:node /app/runtime-dist/reference/api/. ./reference/api

RUN node reference/api/scripts/repair-runtime-workspace-links.mjs \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O- http://localhost:3000/healthz || exit 1

USER node

CMD ["node", "reference/api/dist/reference/api/src/main.js"]
