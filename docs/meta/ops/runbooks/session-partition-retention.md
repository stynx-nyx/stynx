# Session Partition Retention

Drop expired `auth.sessions` month partitions (ADR-SESSIONS-0003). A month
partition is retained until **90 days after the month ends**, matching audit's
`standard_90d` class, and is then dropped. Session rows are personal data, and
their audit trail stays in `audit.log` under audit retention.

## Steps

- Run the privacy retention action as a dry run, which is the default:
  `PrivacyService.applyRetention()` or `GET` the privacy `retention` route
  without `dryRun=false`.
- Review `partitions` in the result. Each entry names a partition, for example
  `auth.sessions_2026_06`, and its `monthEnd`, and shows `dropped: false`.
- Apply the drop with `applyRetention(false)` or `dryRun=false`. The action runs
  as `stynx_owner` in a system context and calls
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
