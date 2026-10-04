---
adr_id: ADR-SESSIONS-0003
title: Retain auth.sessions month partitions for 90 days after the month ends
status: accepted
date: 2026-10-04
authors: ['Architect']
tags: [stynx, sessions, privacy, lgpd, retention, partitioning]
---

# ADR-SESSIONS-0003 — Retain auth.sessions month partitions for 90 days after the month ends

**Status:** Accepted.
**Authority:** Architect, recording the Owner decisions of 2026-10-04 on
stynx-nyx/stynx#337.
**Extends:** ADR-SESSIONS-0002, which creates the monthly partitions and left
retention open.

## Context

ADR-SESSIONS-0002 keeps `auth.sessions` writable across month rollovers, but
nothing removed old months. Partitions therefore grew without bound, and
expired session rows, which hold personal data (`user_id`, `tenant_id`, `sid`),
were kept indefinitely. That conflicts with LGPD data minimisation. Sessions
last 24 hours by default (`timeouts.absoluteSeconds`).

Audit already plans retention with the `standard_90d` and `lgpd_5y` classes
(`planAuditDetach`). `@stynx-nyx/privacy` already exposes the
operator-triggered `applyRetention()`, which is a dry run by default and runs
as `stynx_owner` in a system context.

## Decision

The Owner decided on 2026-10-04:

1. **Retention period.** A month partition is retained until **90 days after
   the month ends**, matching audit's `standard_90d` and leaving time for
   revocation investigations.
2. **Drop.** Expired partitions are dropped, not detached or archived. The
   sessions audit trail lives in `audit.log` under audit retention.
3. **Operator-triggered, dry run by default.** The sweep is part of
   `PrivacyService.applyRetention(dryRun = true)`. It is not scheduled.

Platform migration `0024_auth_sessions_partition_retention.sql` implements
this:

- `auth.sessions_partition_expired(partition_start)` is the single expiry
  predicate: `month end + 90 days <= clock_timestamp()`.
- `auth.drop_expired_sessions_partitions(dry_run boolean DEFAULT true)`:
  - It is executable only by `stynx_owner`, never by `stynx_app` or `PUBLIC`.
  - It considers only partitions of `auth.sessions` named `sessions_YYYY_MM`.
  - It takes the cutoff from the database clock, never from the caller.
  - It returns each expired partition with `dropped`, and drops it only when
    `dry_run` is false.
  - The current and next month can never qualify.
- `auth.ensure_sessions_partition()` now refuses any month the predicate
  calls expired, so a late writer cannot resurrect a dropped month. The
  forward bound of one month ahead is unchanged, and the back bound tightens
  from twelve months to the retention window. The function stays
  `SECURITY DEFINER` with the pinned `search_path` of ADR-SESSIONS-0002.

`PrivacyRetentionResult` gains a `partitions` list of
`PrivacyPartitionRetentionItem`. This is an additive public type change, so the
`@stynx-nyx/privacy` API baseline is rebound.

## Consequences

- The number of `auth.sessions` partitions is bounded by roughly four to five
  months plus the next month, once an operator runs the sweep.
- Dropping is irreversible. The runbook
  `docs/meta/ops/runbooks/session-partition-retention.md` requires a dry run
  first, and recovery means restoring from backup.
- An installation that configures a session lifetime longer than the retention
  window would lose live rows. The default 24-hour lifetime is far inside it,
  and longer lifetimes need a new decision.
- `test/db/auth-sessions-partition-retention-migration.spec.ts` pins the
  predicate, the protected partitions, the owner-only grant, idempotence and
  non-resurrection.
