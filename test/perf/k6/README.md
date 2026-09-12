# k6 Suite

Scenarios:

- `auth.js`: reference dev-login plus auth verification
- `crud.js`: record CRUD plus idempotency and rate-limit touchpoints
- `upload.js`: presign + PUT + complete document flow
- `cascade-delete.js`: cascade-oriented soft-delete flow

Local smoke run against the reference stack:

```bash
docker compose -f reference/api/docker-compose.yml up -d --build
STYNX_K6_DURATION=10s \
STYNX_K6_RATE=5 \
STYNX_K6_PREALLOCATED_VUS=1 \
STYNX_K6_MAX_VUS=2 \
node test/perf/k6/run-scenarios.mjs --scenario crud
```

The bundled `reference/api/docker-compose.yml` applies a perf-friendly override for
`sample.documents.create` and `sample.documents.complete` so the upload scenario measures
storage flow latency instead of immediately self-throttling on the demo tenant.

## Thresholds and CI

Each scenario declares k6 `thresholds` for HTTP failure rate and p95/p99 latency.
The `run-scenarios.mjs` wrapper propagates the k6 process exit code, so a threshold
breach fails local runs and `.github/workflows/hardening.yml`.

The hardening workflow also uploads `*.summary.json` artifacts and compares the
current custom metrics with the most recent successful `main` baseline through
`check-summary.mjs` (decision record: `law/adr/2026-09-12-k6-baseline-comparison.md`).
A tracked metric is degraded only when **both** its p95 and its p99 exceed the
effective baseline by more than 10% and by more than 1 ms; the effective baseline
per statistic is `max(previous successful run, baseline-reference.json)`, so an
unusually fast run cannot lower the bar below the documented steady state.
`baseline-reference.json` is Architect-owned and is advanced deliberately with the
run ids that justify the new values. The first successful main run may seed a
baseline; later runs must either find the matching baseline artifact or fail.

When the comparison fails on a tail statistic while the median is unchanged, the
excursion is usually environmental. Before re-dispatching, bisect it on CI:
create temporary refs for intermediate `main` commits (`gh api repos/<owner>/<repo>/git/refs -f ref=refs/heads/perf/k6-bisect-<sha> -f sha=<sha>`),
dispatch `hardening.yml` on each with `-f scenario=<scenario>` (about 8 minutes
each, they run in parallel), compare the metric's p95/p99 across the refs, and
delete the refs afterwards. Only a successful `k6` check-run on the exact
candidate SHA counts as publication evidence; earlier failures on that SHA do not
block it.

Supported env overrides:

- `STYNX_K6_BASE_URL`
- `STYNX_K6_S3_PUBLIC_BASE_URL`
- `STYNX_K6_DURATION`
- `STYNX_K6_RATE`
- `STYNX_K6_AUTH_RATE`
- `STYNX_K6_CRUD_RATE`
- `STYNX_K6_UPLOAD_RATE`
- `STYNX_K6_CASCADE_DELETE_RATE`
- `STYNX_K6_PREALLOCATED_VUS`
- `STYNX_K6_MAX_VUS`
- `STYNX_K6_SCENARIO`
- `STYNX_K6_SCENARIO_PAUSE_MS`

The runner defaults to `http://127.0.0.1` on Linux and
`http://host.docker.internal` on macOS/Windows for requests made from the k6
container. Override explicitly when needed:

```bash
STYNX_K6_BASE_URL=http://host.docker.internal:3000
STYNX_K6_S3_PUBLIC_BASE_URL=http://host.docker.internal:4566
```
