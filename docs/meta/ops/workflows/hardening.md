# hardening

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/hardening.yml`
("Hardening").

Scheduled k6 load scenarios against the reference stack.

## Triggers

Weekly cron (Monday 04:00 UTC) and manual dispatch.

## Jobs

- `k6`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

Not a pull-request gate.

The upload scenario sets `STYNX_K6_STORAGE_PRESIGN_P99_MS=50`, retaining
the existing accepted limit `storage_presign_duration_ms` p99 < 50 ms and
the scenario default. See [ADR-PERF-0001](../../../../law/adr/2026-10-10-http-performance-evidence.md).
A historical run configured with 500 ms does not prove the 50 ms limit.
This component threshold remains part of the existing scenario gates; it
does not establish complete protected-endpoint p50/p95 coverage.
