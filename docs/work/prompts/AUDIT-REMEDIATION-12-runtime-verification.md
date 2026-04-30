# 12 — Runtime verification: DB structure, metrics, k6 SLOs, smoke

**Closes:** FIND-012, FIND-030, FIND-032, FIND-033 (MINOR).
**Branch:** `audit-remediation/12-runtime-verification`.
**Spec:** §11.2, §26, §17.

## Why

These items were UNKNOWN in the audit because they require runtime
exercise. They're MINOR individually but together they convert
"claim-only" into "verifiable."

## What to do

### `pnpm db:verify`

1. Add `scripts/db-verify.mjs` that, after `stynx migrate up`, queries
   Postgres and asserts:
   - Schemas: `core`, `tenancy`, `auth`, `audit`, `storage`,
     `archive`, `data`, `public`.
   - Roles: `stynx_owner` (BYPASSRLS), `stynx_app` (no bypass),
     `stynx_reader` (no bypass, NOLOGIN attribute as appropriate).
   - For every soft-deletable live table: matching `archive.*` mirror.
   - For every tenant-scoped table: `tenant_id` column + RLS policy.
   - Audit trigger present on every audited table.
2. Wire `pnpm db:verify` into the integration-test job after the
   migrate step.

### Metrics verification

1. Add an integration test in `apps/reference-api` that boots the API
   against a Testcontainers Postgres + Redis, exercises a few
   endpoints, scrapes `GET /metrics`, and asserts each SPEC §11.2
   metric name is present:
   - `http_requests_total`, `http_request_duration_seconds`,
     `db_query_duration_seconds`, `audit_events_total`,
     `lgpd_erasure_total{table,strategy}`, plus any other listed.

### k6 SLO thresholds

1. Add explicit `thresholds` blocks to each k6 scenario matching
   SPEC §26 SLOs (p95 latency, error rate).
2. Ensure `hardening.yml` fails the workflow on threshold breach
   (k6 exit code propagates).

### `pnpm smoke:local`

1. Add `scripts/smoke-local.sh` that:
   - Spins up `docker compose up -d` from `apps/reference-api/`.
   - Runs `stynx migrate up`.
   - Executes the canonical user journey: provision tenant → create
     user → log in → upload doc → soft-delete doc → restore →
     hard-delete.
   - Asserts each step's HTTP response.
   - Tears down the stack on success or failure.

## Acceptance

- `pnpm db:verify` exits 0 against the migrated dev DB.
- The metrics-emission test passes in CI.
- A deliberate p95 regression in a k6 scenario fails the hardening
  workflow.
- `pnpm smoke:local` exits 0 from a clean checkout.

## Verify

```
pnpm db:verify
pnpm --filter @stynx/reference-api test:int
pnpm smoke:local
```
