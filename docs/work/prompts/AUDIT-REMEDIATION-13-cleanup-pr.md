# 13 — Cleanup PR: bundled minors

**Closes:** FIND-019, FIND-020, FIND-022, FIND-028, FIND-029 (MINOR).
**Branch:** `audit-remediation/13-cleanup`.

A single PR (or one commit per item) bundling small, independent fixes.

## Items

### FIND-019 — Frontend test density audit

- For each `packages-web/*`, count tests; if structurally below the
  85 % coverage threshold, add unit tests for the public surface or
  migrate from any `frontend/`-legacy harness that survived prompt 06.
- Acceptance: each frontend package's `pnpm --filter <pkg> test --coverage`
  hits the configured threshold.

### FIND-020 — Upgrade `bootstrap` (npm package) past XSS advisory

- In `apps/reference-web/package.json` (or wherever it's pulled in),
  bump `bootstrap` to `^5.3.8`.
- Acceptance: `pnpm audit --audit-level=moderate` shows no `bootstrap`
  advisory.

### FIND-022 — Document or fix the `auth → idempotency` layering inversion

- Either (a) move `idempotency` below `auth` in the dep graph, or
  (b) document the inversion in `packages/auth/README.md` and
  `docs/rfcs/`.
- Acceptance: spec §3 layered DAG is either followed literally or
  documented as deliberately diverged.

### FIND-028 — Add `HEALTHCHECK` to Dockerfiles

- `apps/reference-api/Dockerfile`:
  ```
  HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q -O- http://localhost:3000/healthz || exit 1
  ```
- Same pattern for `apps/reference-web/Dockerfile` (path/port adjusted).
- Acceptance: `docker inspect <image> | jq '.[0].Config.Healthcheck'`
  is non-null for both.

### FIND-029 — Add `cognito-local` to docker-compose

- Add a `cognito-local` service to `apps/reference-api/docker-compose.yml`.
- Wire `apps/reference-api` env to point at it for local dev.
- Acceptance: `docker compose up cognito-local` brings the service up
  with a healthcheck; reference-api can issue tokens against it.

## Verify

```
pnpm -w test --coverage
pnpm audit --audit-level=moderate
docker build -t test apps/reference-api && docker inspect test | jq '.[0].Config.Healthcheck'
docker compose -f apps/reference-api/docker-compose.yml up -d cognito-local
```
