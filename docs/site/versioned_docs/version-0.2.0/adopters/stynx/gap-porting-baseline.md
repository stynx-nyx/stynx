# Gap-Porting Baseline

**Date:** 2026-04-26  
**Status:** complete for `GAP-001..006` local closure target

## Spec Gate

The six GAP specs remain as long-lived reference specs, and the matching
`internal work note (not published)` files remain as executable prompt history. All six
specs are now marked complete after rechecking code, exported package surfaces,
tests, and package build output:

- `specs/GAP-001-audit-hash-chain.md`
- `specs/GAP-002-dead-code-detection.md`
- `specs/GAP-003-config-ownership.md`
- `specs/GAP-004-session-tenant-exchange.md`
- `specs/GAP-005-s3-lifecycle-lock.md`
- `specs/GAP-006-permission-drift-slo.md`

## Implementation Evidence

- `GAP-001`: `audit.events` now carries `previous_hash` and trigger-computed
  `row_hash` in both the DDL and package migration path. `audit.verify_chain`
  recomputes hashes and detects direct row tampering in integration coverage.
- `GAP-002`: root dead-code and dependency checks are available and green
  through `pnpm lint:deadcode` and `pnpm lint:deps`.
- `GAP-003`: config schema metadata includes owner annotations and rejects
  ownership violations through package-level coverage.
- `GAP-004`: session exchange types, errors, and service behavior are exported
  and covered for happy path, owner mismatch, missing session, and inactive
  session handling.
- `GAP-005`: storage exposes S3 compliance options, lifecycle/object-lock
  command handling, tenant download presigning, and related unit/integration
  proof.
- `GAP-006`: rate-limit latency histograms and proactive permission drift
  resync behavior are exported and covered, including fake-timer unit coverage.

## 2026-05-17 Revalidation

Wave 05 of the known-gaps remediation sequence revalidated the audit/privacy
claims against the current workspace:

- `pnpm --filter @stynx-nyx/audit test` passed 2 suites / 3 tests, including the
  hash-chain unit coverage.
- `pnpm --filter @stynx-nyx/privacy test` passed 2 suites / 7 tests. The LGPD
  fixture now proves live rows, archive mirrors, PII map loading, erasure across
  all supported strategies, Cognito disablement, `audit.log` LGPD tags, and
  hashed `audit.events` preservation.
- `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx-nyx/data test:int` passed 3
  suites / 12 tests with the curated-table DML audit invariant enabled.
- `pnpm test` passed across the workspace (`Tasks: 63 successful, 63 total`).

## Local Closure Gate

Commands were run from the repository root on 2026-04-26:

| Command                    | Exit | Captured result                                                                                                                                                   |
| -------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`               |  `0` | `Tasks: 38 successful, 38 total`; docs API coverage verified for 24 packages; Docusaurus generated static files without the previous TypeDoc/Docusaurus warnings. |
| `pnpm --filter docs build` |  `0` | docs API coverage verified for 24 packages; Docusaurus generated static files from the standalone docs package path.                                              |
| `pnpm lint`                |  `0` | `Tasks: 39 successful, 39 total`; zero ESLint warnings.                                                                                                           |
| `pnpm test`                |  `0` | package tests: 19 suites / 66 tests; backend tests: 5 suites / 5 tests; frontend tests: 3 suites / 3 tests; script validation passed.                             |
| `pnpm test:int`            |  `0` | `Tasks: 38 successful, 38 total`; DB tests: 3 suites / 10 tests.                                                                                                  |
| `pnpm lint:deadcode`       |  `0` | `knip --no-config-hints` completed without findings.                                                                                                              |
| `pnpm lint:deps`           |  `0` | `No depcheck issue`.                                                                                                                                              |

## Release-Readiness Closure

The GAP porting target and Prompt 37 release-readiness follow-ups are closed.
The remaining browser, docs, k6, mutation, release-prep, and release workflow
gates were proven in GitHub Actions on `main`.

The Prompt 37 container-artifact scope was revised to remove the AWS/ECR/Cosign
secret prerequisite. Release Artifacts now builds reference images on the
GitHub-hosted runner and uploads Syft SBOMs plus Docker image metadata as
reviewable artifacts.

CI remains the release authority for browser and Lighthouse evidence; local
container runs are retained as fast preflight coverage, not final closure proof.
