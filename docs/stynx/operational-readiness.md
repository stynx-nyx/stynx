# Operational Readiness

**Authority:** Architect (Constitution Article 6).

This document is the current MVP operations bar for regulated STYNX adopters.

## Release Artifacts

- Package tarballs are validated by `pnpm release:consumer-fixtures`.
- Public API declarations are guarded by `pnpm api:baselines`.
- OpenAPI and generated SDK route coverage are guarded by `pnpm api:contract`
  and `pnpm sdk:route-smoke`.
- SBOM freshness, license policy, secret scan, and production audit are covered
  by `pnpm security:release`.

## Install Verification

Run these before declaring a release candidate:

```bash
pnpm audit --prod
pnpm check:engines
pnpm api:coverage
pnpm api:contract
pnpm sdk:route-smoke
pnpm api:baselines
pnpm release:consumer-fixtures
pnpm check:rls-negative
pnpm frontend:production-smoke
pnpm security:release
pnpm lint
pnpm typecheck
```

## Starter App Verification

The supported starter path is a small app that imports only public package
exports and generated SDK services. It must not import package `src/` internals.
Use the SGP, PEC, and TEAT-style fixtures in `scripts/verify-consumer-fixtures.mjs`
as the minimum install proof.

## Observability Guidance

- API routes must emit request id, tenant id, actor id, route, status, duration,
  and error taxonomy code.
- Tenant and auth failures must be visible as counters without exposing
  cross-tenant resource existence.
- Flow operations should include run id, node id, task id, adapter key, and
  idempotency key where available.
- Storage operations should include document id, bucket, object key hash, tenant
  id, and presign latency.

## Error Taxonomy

`docs/contracts/errors.json` is the shared taxonomy. Public APIs should prefer
Problem Details responses and avoid ad hoc string-only errors for adopter-facing
contracts.

## Migration Runbooks

- Database role rotation: `docs/ops/runbooks/db-role-rotation.md`.
- Tenant suspension: `docs/ops/runbooks/tenant-suspension.md`.
- Session revocation: `docs/ops/runbooks/session-revocation.md`.
- Flow operations: `docs/ops/runbooks/flow.md`.
- PostgreSQL restore: `docs/ops/recovery/pg-backup-restore.md`.

## Known Limitations

- Registry publication is opt-in until package namespace ownership and
  provenance-enabled publish credentials are configured.
- Browser-level frontend integration and axe-based accessibility scans are not
  yet a required CI gate; current frontend confidence is package Vitest coverage,
  fixture installs, and SDK route smoke coverage.
- Container image signing is scoped to reference-app deployment hardening, not
  the framework package release lane.
- Runtime RLS negative coverage is strongest for auth, audit, and storage DB
  policies. Flow, records, and reference API route coverage is enforced through
  OpenAPI/source contract tests until full DB-backed cross-tenant fixtures are
  expanded for those surfaces.
