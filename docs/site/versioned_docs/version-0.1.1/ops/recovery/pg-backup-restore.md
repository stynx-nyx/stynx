# PostgreSQL Backup Restore

Restore a PostgreSQL backup while preserving STYNX role and RLS invariants.

## Steps

- Select the approved backup and target environment.
- Restore into an isolated database first.
- Run migrations and `pnpm db:verify` against the restored target.
- Replay required secrets and extension setup.
- Cut traffic over only after application readiness passes.

## Verification

- Schema, role, RLS, archive mirror, and audit trigger checks pass.
- Sample tenant reads are isolated.
- Application health and metrics endpoints are green.

## Rollback

- Keep the previous database online until cutover is confirmed.
- If validation fails, drop the restored target and restart from a known-good backup.
