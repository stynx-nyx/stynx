# Operations

**Authority:** Architect (Constitution Article 6).

Operator-facing runbooks and recovery procedures for the STYNX reference deployment.

## Runbooks

- [Tenant suspension](runbooks/tenant-suspension.md)
- [LGPD erasure](runbooks/lgpd-erasure.md)
- [Session revocation](runbooks/session-revocation.md)
- [Database role rotation](runbooks/db-role-rotation.md)
- [Cognito federation onboarding](runbooks/cognito-federation-onboarding.md)
- [Flow operations](runbooks/flow.md)

## Recovery

- [PostgreSQL backup restore](recovery/pg-backup-restore.md)
- [KMS key recovery](recovery/kms-key-recovery.md)
- [Cognito user pool restore](recovery/cognito-user-pool-restore.md)

## Local Operability

- `pnpm smoke:local` starts the reference compose stack, runs migrations, exercises
  login, record creation, document upload, restore, and hard-delete, then tears the
  stack down. The smoke defaults the host PostgreSQL compose port to `55432` to avoid
  clashing with a developer's local PostgreSQL on `5432`; override with
  `STYNX_SMOKE_POSTGRES_PORT` or `STYNX_SMOKE_DATABASE_URL` when needed.
- `pnpm --filter @stynx-nyx/reference-api test:int` verifies runtime metrics,
  tenancy/RLS, audit, storage, and soft-delete behavior with Testcontainers.
- `node test/perf/k6/run-scenarios.mjs --scenario crud` runs a k6 scenario against
  an already-running reference stack.
