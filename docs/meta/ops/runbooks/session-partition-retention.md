# Session Partition Retention

Drop expired `auth.sessions` month partitions (ADR-SESSIONS-0003). A month
partition is retained until **90 days after the month ends**, matching audit's
`standard_90d` class, and is then dropped. Session rows are personal data, and
their audit trail stays in `audit.log` under audit retention.

## STYNX 1.6 authorization boundary

The Owner selected tenant-scoped privacy HTTP and global internal jobs under
ADR-0019 and the [privacy administration contract](../../../framework/contracts/privacy-administration-1.6.md).
`GET /privacy/retention` now reports or applies eligible tenant row retention
only, with `partitions: []`. Its `dryRun=false` form does not drop global session
partitions. Previous HTTP instructions for whole-partition maintenance are
superseded by the explicit internal operator procedure below. The retention
period, database clock, owner-only grants and current/next-month protection are
unchanged; no automated schedule is introduced.

## Steps

- Use an authorized internal operator/job caller outside HTTP origin. Establish
  an explicit SystemContext with the operation reason and retain the operator
  actor/job receipt. Run `PrivacyService.applyRetention()` as a dry run, which is
  the default. The service does not establish owner authority for its caller.
- Review `partitions` in the result. Each entry names a partition, for example
  `auth.sessions_2026_06`, and its `monthEnd`, and shows `dropped: false`.
- After reviewing that exact dry run, apply the drop through the same authorized
  internal caller with `applyRetention(false)`. The action runs as `stynx_owner`
  within the caller-established system context and calls
  `auth.drop_expired_sessions_partitions(false)`.

The cutoff comes from the database clock and cannot be passed in. The current
and next month never qualify, and partitions not named `sessions_YYYY_MM` are
never touched.

## Verification

- The result lists the same partitions with `dropped: true`.
- A second dry run returns an empty `partitions` list.
- `select relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'auth.sessions'::regclass`
  no longer lists the dropped months.

## Rollback

- A dropped partition cannot be restored from the database. Restore it from a
  backup taken before the sweep (see
  [PostgreSQL backup restore](../recovery/pg-backup-restore.md)) only under a
  documented LGPD justification.
- `auth.ensure_sessions_partition()` refuses to recreate an expired month, so
  writers cannot resurrect it.
