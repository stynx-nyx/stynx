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
current p99 custom metrics with the most recent successful `main` baseline through
`check-summary.mjs`. The first successful main run may seed a baseline; later runs
must either find the matching baseline artifact or fail.

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
