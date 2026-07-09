FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY reference/web ./reference/web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @stynx-nyx/reference-web build:web

FROM node:24-alpine AS runtime
# Patch base-image OS packages; Trivy gates HIGH/CRITICAL (e.g. CVE-2026-45447
# in libcrypto3 < 3.5.7-r0 shipped by the current node:24-alpine tag).
RUN apk upgrade --no-cache
WORKDIR /app
COPY --from=build --chown=node:node /app/reference/web ./reference/web
ENV PORT=3100
EXPOSE 3100
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O- http://localhost:3100/ || exit 1
USER node
CMD ["node", "reference/web/scripts/serve-static.mjs"]
