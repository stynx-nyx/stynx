---
adr_id: ADR-SESSIONS-0002
title: Monthly partition maintenance for auth.sessions
status: accepted
date: 2026-10-04
authors: ['Architect']
tags: [stynx, sessions, data, partitioning, security-definer]
---

# ADR-SESSIONS-0002 — Monthly partition maintenance for auth.sessions

**Status:** Accepted.
**Authority:** Architect, under the Owner's 2026-10-04 direction to fix
`auth.sessions` partition maintenance.

## Context

`auth.sessions` is range-partitioned by `created_at`.
`0005_auth.sql` created only the partition for the month in which it ran, and
nothing created later months. Every deployment therefore rejected session
inserts with `23514` ("no partition of relation sessions found for row") from
the first month rollover after migrating. The defect surfaced on 2026-10-04,
when the `@stynx-nyx/sessions` integration suite ran against a template
database migrated in September.

The only writer is `SessionMirrorWriter.append`, which inserts with the
session's own `created_at` while running as the RLS app role `stynx_app`. That
role cannot create partitions of a table it does not own.

## Decision

1. Platform migration `0023_auth_sessions_partitions.sql` adds
   `auth.ensure_sessions_partition(reference_time timestamptz)`, modelled on
   `audit.ensure_monthly_partition()`:
   - **Privileges:** it is `SECURITY DEFINER` with a pinned
     `search_path = pg_catalog, auth`, because only the owner may create
     partitions. `PUBLIC` loses `EXECUTE`, and only `stynx_app` and
     `stynx_owner` are granted it.
   - **Hot path:** it returns the partition name without DDL when the partition
     already exists.
   - **Window:** it refuses a month more than twelve months before or one month
     after the current month (`22023`), and refuses a null reference (`22004`).
     This bounds the tables an app-role caller can create. The window covers the
     longest session lifetime and clock skew across a rollover.
2. The migration creates the current and next month on apply, so existing
   deployments are safe across the next rollover before any writer runs.
3. `SessionMirrorWriter.append` calls the function for the row's `created_at`
   inside the insert transaction, before the insert.
4. A default partition is **not** added. Rows routed into a default partition
   would block later creation of their month's partition, and the function
   already makes the missing-month path impossible for the writer.

## Consequences

- Session inserts keep working across month rollovers, and
  `test/db/auth-sessions-partitions-migration.spec.ts` pins the window, the
  idempotence and the grants.
- Partition retention, meaning dropping old months, is still not automated. It
  remains an operator task, tracked for its own decision in
  stynx-nyx/stynx#337.
- Partitions inherit queries through the parent. RLS, grants and the audit
  trigger stay defined on `auth.sessions`, as for the partition that `0005`
  creates.
