# Wave 02 Package Topology Report

**Date:** 2026-05-17
**Role:** Architect + Engineer + Inspector
**Scope:** P-01, P-02, P-03, P-06, Q-01.

## Changes Made

- Added `docs/adr/ADR-003-rbac-matrix-role.md`.
- Marked `docs/RBAC Matrix.md` as a generated diagnostic/template artifact,
  not the canonical framework RBAC implementation.
- Updated `docs/KNOWN_GAPS.md` to close stale package topology findings with
  current evidence.

## Verification Evidence

| Command | Result | Notes |
| --- | ---: | --- |
| `pnpm --filter @stynx/contracts build` | pass | Confirms `@stynx/contracts` exists and builds. |
| `pnpm --filter @stynx-web/angular-tenancy build` | pass | Confirms `@stynx-web/angular-tenancy` exists and builds. |
| `pnpm --filter @stynx/privacy test` | pass | 2 suites / 7 tests. |
| `rg -n "@aws-sdk/client-s3" packages/privacy packages/storage packages/auth packages/data` | pass for P-03 | Matches only `packages/storage` source/tests/package metadata. |
| `rg -n "@stynx/contracts\|@stech/stynx-contracts\|@stynx-web/angular-tenancy" ...` | observed | Active source imports use `@stynx/contracts` and `@stynx-web/angular-tenancy`; stale docs still mention old package names in historical audit/porting material. |
| `docs/rfcs/0008-auth-idempotency-layering.md` inspection | pass | Auth/idempotency dependency is accepted as a narrow decorator-only exception. |

## Closed Rows

- P-01: `@stynx/contracts` missing is stale.
- P-02: `@stynx-web/angular-tenancy` missing is stale.
- P-03: privacy direct-S3 invariant violation is stale; direct S3 imports are
  only in storage.
- P-06: auth/idempotency layering inversion is closed by RFC 0008.
- Q-01: RBAC Matrix role is closed by ADR-003.

## Remaining Route

Continue with Wave 03 for the remaining rationalization rows:

- P-04 still has a live `pnpm-workspace.yaml` question because `test/*` remains
  in the workspace.
- P-05 appears stale (`apps/reference-frontend` absent), but should be closed
  together with workspace rationalization documentation.
