---
'@stynx-nyx/data': patch
'@stynx-nyx/privacy': patch
---

Retain `auth.sessions` month partitions until 90 days after the month ends, then
drop them. Platform migration `0024_auth_sessions_partition_retention.sql` adds:

- `auth.drop_expired_sessions_partitions(dry_run)`, executable only by
  `stynx_owner`. The cutoff comes from the database clock, the current and next
  month never qualify, and only `sessions_YYYY_MM` partitions are considered.
- A tighter `auth.ensure_sessions_partition()` that refuses to recreate a month
  retention would drop.

`PrivacyService.applyRetention()` stays a dry run by default and now also
reports the expired session partitions in a new `partitions` result field. They
are dropped only with `applyRetention(false)`.
