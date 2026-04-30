# 06 — Operational Readiness

## Infrastructure-as-Code

`infra/cdk/lib/`:

| Stack                    | Spec §             | Present |
| ------------------------ | ------------------ | ------- |
| `network-stack.ts`       | NetworkStack       | ✅      |
| `data-stack.ts`          | DataStack          | ✅      |
| `identity-stack.ts`      | IdentityStack      | ✅      |
| `compute-stack.ts`       | ComputeStack       | ✅      |
| `observability-stack.ts` | ObservabilityStack | ✅      |
| `storage-stack.ts`       | StorageStack       | ✅      |
| **`edge-stack.ts`**      | EdgeStack          | ❌      |

The spec & STYNX-CDK-SKELETON.md call for **six** stacks plus an
EdgeStack (CloudFront/WAF). Six are present; **EdgeStack is missing**.
FIND-005.

`cdk synth` was not executed in this audit (would require AWS env
plumbing). Stack file presence is the only signal.

`ObservabilityStack` defines 7 alarms (ALB 5xx, ECS CPU, DB CPU, DB
free storage, DB connections, Redis CPU, Redis evictions) — matches
SPEC §11.4 baseline alarm set.

## Containerization

`apps/reference-api/Dockerfile`:

- Multi-stage (workspace → build → prod-deps → runtime) ✅
- `USER node` (non-root) ✅
- Base `node:24-bookworm-slim` (slim, pinned major) ✅
- `npm`/`npx` removed in runtime stage ✅
- `NODE_ENV=production` ✅
- **No `HEALTHCHECK` instruction** ❌ — FIND-028

`apps/reference-web/Dockerfile`:

- Multi-stage (build → runtime) ✅
- `USER node` ✅
- Base `node:24-alpine` ✅
- Static via `scripts/serve-static.mjs`
- **No `HEALTHCHECK` instruction** ❌

No secrets baked into either image (verified via grep).

## Local Environment

`apps/reference-api/docker-compose.yml`:

| Service       | Image                | Healthcheck                           |
| ------------- | -------------------- | ------------------------------------- |
| postgres      | `postgres:16-alpine` | `pg_isready` ✅                       |
| redis         | `redis:7-alpine`     | `redis-cli ping` ✅                   |
| localstack    | `localstack:3.8.1`   | HTTP /\_localstack/health ✅          |
| reference-api | local build          | `depends_on` + healthcheck conditions |

LocalStack scoped to S3 only (`SERVICES=s3`), suggesting Cognito-local
is wired separately or absent — UNKNOWN. The audit prompt expected a
`cognito-local` container; not present here. FIND-029 (MINOR).

`docker compose up -d` was **not** executed in this audit (would mutate
the host state and consume time budget).

## Migrations

- Drizzle migrations live under `packages/data/migrations/` (declared in
  `packages/data/package.json` `files` array).
- Reference app migration: `apps/reference-api/migrations/0001_reference.sql`.
- `@stynx/cli` is the migration runner (per `package.json` scripts).

Migrations were **not applied** to a fresh DB in this audit. The
migration-linter test failure (FIND-004) means the lint gate is broken
and 4 parser errors exist in repo migrations — they may or may not
apply cleanly. Recommend resolving FIND-004 _before_ attempting a fresh
migration run.

## Health & Observability

`packages/health/src/health.controller.ts` exposes:

| Endpoint       | Purpose           | Notes                                |
| -------------- | ----------------- | ------------------------------------ |
| `GET /healthz` | Liveness          | Always 200                           |
| `GET /readyz`  | Readiness         | Composes `StynxHealthService` checks |
| `GET /metrics` | Prometheus scrape | IP allowlist via `prom-client`       |
| `GET /info`    | Platform info     | Guarded                              |

Wired in `apps/reference-api`.

Spec §11.2's metric list (`http_requests_total`, `http_request_duration_seconds`,
`db_query_duration_seconds`, `audit_events_total`,
`lgpd_erasure_total{table,strategy}`, etc.) was **not** emission-verified
in this audit. The `prom-client` integration exists; whether each named
metric is registered requires running the API and curling `/metrics`.
UNKNOWN. FIND-030.

OpenTelemetry tracing: `packages/core` has spans wired (per file
inspection). End-to-end trace propagation not verified.

Structured JSON logs: confirmed via `packages/logging/src/pino.factory.ts`
production formatter.

## Backup & Recovery

`docs/operations/` does **not** exist. `docs/dev/ops.md` covers Cognito
public-client policy and bootstrap workflow but is not an operations
runbook. No backup/restore procedure for Postgres, KMS, or Cognito User
Pool is documented. FIND-031 (MAJOR).

## Runbooks

Spec §11.5 / §17 implies runbooks for:

| Runbook                       | Present |
| ----------------------------- | ------- |
| Tenant suspension             | ❌      |
| LGPD erasure execution        | ❌      |
| Manual session revocation     | ❌      |
| DB role password rotation     | ❌      |
| Cognito federation onboarding | ❌      |

**0 / 5** runbooks present. FIND-031.

## Performance

`test/perf/k6/`:

- 5 k6 scripts (`auth.js`, `crud.js`, `cascade-delete.js`, `upload.js`,
  `run-scenarios.mjs`)
- `lib/` shared utilities
- `results/` archive with 15 historical runs

CI integration: `.github/workflows/hardening.yml` includes k6 (per
recent commit `457da90 ci: parameterize k6 upload threshold for actions`
and earlier `1423816 ci: tune hardening k6 profile for hosted runners`).
SLO conformance vs. SPEC §26 was not checked against the most recent
results in this audit — UNKNOWN. FIND-032.

## Smoke Tests

End-to-end smoke (provision tenant → create user → log in → upload doc →
soft-delete → restore → hard-delete) was **not executed**. The
infrastructure to run it is present (docker-compose, reference-api,
reference-web, Playwright in `apps/reference-web/`). Recorded as
UNKNOWN — FIND-033.

LGPD pipeline smoke was likewise **not executed**. With only one test in
`@stynx/privacy` and no runbook (FIND-031), the LGPD pipeline is
under-evidenced for v1.0.

## Secrets Handling — **PASS**

- No hardcoded production secrets in source.
- Test fixtures use `AWS_ACCESS_KEY_ID=test` (LocalStack convention) —
  acceptable.
- `docker-compose.yml` exposes `test`/`test` for LocalStack — acceptable.

## Aggregate Operational Grade

| Item                      | Grade                                  |
| ------------------------- | -------------------------------------- |
| IaC (CDK stacks)          | B (6/7 stacks)                         |
| Container hardening       | B (no HEALTHCHECK)                     |
| Local env                 | B (no Cognito-local)                   |
| Migrations                | C (linter broken; not freshly applied) |
| Health endpoints          | A                                      |
| Metrics emission verified | UNKNOWN                                |
| Backup/recovery docs      | F                                      |
| Runbooks (5 expected)     | F (0/5)                                |
| Performance harness       | B (CI'd; SLO conformance unverified)   |
| Smoke tests run           | UNKNOWN                                |
| Secrets handling          | A                                      |

Weighted: roughly **C**. Infrastructure shape is in place but
operations docs are largely absent and the linter regression
undermines confidence in the migration path.
