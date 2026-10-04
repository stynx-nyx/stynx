---
'@stynx-nyx/data': patch
'@stynx-nyx/sessions': patch
---

Keep `auth.sessions` writable across month rollovers. Platform migration
`0023_auth_sessions_partitions.sql` adds `auth.ensure_sessions_partition()`
(owner-run, idempotent, limited to twelve months back and one month ahead,
executable only by `stynx_app` and `stynx_owner`) and creates the current and
next month's partitions. `SessionMirrorWriter` ensures the row's month
partition before every insert. Previously only the month in which the
migration ran had a partition, so session inserts failed with `23514` from the
first rollover after migrating.
