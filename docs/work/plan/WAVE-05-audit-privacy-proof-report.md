# Wave 05 Audit and Privacy Proof Report

**Date:** 2026-05-17
**Roles:** Inspector / Engineer
**Prompt:** `docs/work/plan/KNOWN-GAPS-WAVE-05-audit-privacy-proof.md`

## Result

Wave 05 is complete for stynx-owned audit, privacy, and data migration proof.

The audit hash-chain and LGPD fixture gaps were stale against the current
workspace, but the wave added stronger assertions and closed the missing future
invariant for curated-table DML audit.

## Implemented

- Added a dynamic migration invariant in
  `packages/data/test/integration/migrations.spec.ts` that fails when any base
  table in `auth`, `core`, `flow`, `storage`, or `tenancy` lacks a
  `trg_audit_%` DML trigger.
- Extended the privacy integration test to assert LGPD erasure also emits hashed
  `audit.events`, not only tagged `audit.log` rows.
- Added `packages/data/migrations/platform/0017_audit_row_identifier.sql` so
  `audit.fn_row_change()` no longer assumes audited tables have an `id` column.
  It now derives stable row identifiers from `id`, `tenant_id`, `document_id`,
  or a row JSON hash fallback.
- Fixed Cognito session exchange in `@stynx/auth` so audited auth-table writes
  use the local STYNX user UUID as `app.actor_id`, not an opaque Cognito
  subject.
- Updated durable status in `docs/KNOWN_GAPS.md` and
  `docs/stynx/gap-porting-baseline.md`.

## Evidence

- `pnpm --filter @stynx/audit test`
  - Result: passed, 2 suites / 3 tests.
- `pnpm --filter @stynx/privacy test`
  - Result: passed, 2 suites / 7 tests.
- `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int`
  - Result: passed, 3 suites / 12 tests.
- `pnpm --filter @stynx/i18n test`
  - Result: passed after the row-identifier migration fixed
    `tenancy.tenant_settings` audit writes.
- `pnpm test`
  - Result: passed, `Tasks: 63 successful, 63 total`.
- `pnpm lint:migrations`
  - Result: passed, `clean (18 files)`.
- `pnpm run doctor`
  - Result: passed.
- `git diff --check`
  - Result: passed.

## Notes

The first root `pnpm test` attempt failed in `@stynx/i18n` with
`record "old" has no field "id"`. That failure exposed the audit trigger
assumption fixed by `0017_audit_row_identifier.sql`; the rerun passed.
