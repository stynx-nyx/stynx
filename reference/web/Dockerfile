# syntax=docker/dockerfile:1
# The `# syntax` pragma above must stay the first line -- it pins the
# BuildKit frontend version needed for `RUN --mount=type=secret` below.
FROM node:24-alpine AS build
WORKDIR /app
# node-gyp toolchain for optional native postinstalls (ssh2/cpu-features);
# without it the image build spews non-fatal gyp "find Python" errors.
# Build stage only — the runtime stage stays toolchain-free.
RUN apk add --no-cache python3 make g++
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json .npmrc ./
COPY tools ./tools
COPY packages ./packages
COPY packages-web ./packages-web
COPY reference/web ./reference/web

# @devai-nyx/* resolves from GitHub Packages (see .npmrc); NODE_AUTH_TOKEN is
# passed as a BuildKit secret (not an ARG/ENV) so it never lands in an image
# layer or build-history entry.
RUN --mount=type=secret,id=node_auth_token \
  NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" \
  pnpm install --frozen-lockfile
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
