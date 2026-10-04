---
adr_id: ADR-SECURITY-AUDIT-0001
title: Time-boxed workspace audit exception for unpatched dev and docs advisories
status: accepted
date: 2026-10-04
authors: ['Architect']
tags: [stynx, security, dependencies, release]
---

# ADR-SECURITY-AUDIT-0001 — Time-boxed workspace audit exception for unpatched dev and docs advisories

**Status:** Accepted.
**Authority:** Architect, under the Owner's 2026-10-04 decision to accept a
time-boxed audit exception for advisories that have no patched release and
reach only development and documentation paths.

## Context

Since the 2026-10-01 admin merges, `verified-local-rc` has failed on `main`.
One cause is the RC `security` task: `pnpm security:release` ran
`pnpm audit --prod` with no severity floor. The remote `dependency-audit`
check ran `pnpm audit --audit-level=high` and failed the same way whenever its
path filter matched. Three high advisories, published on 2026-09-18 and
2026-10-02, were involved:

| Advisory              | Package                | Patched release | Workspace importers                                                |
| --------------------- | ---------------------- | --------------- | ------------------------------------------------------------------ |
| `GHSA-gjj5-9665-rwrc` | `probe-image-size`     | `>=7.4.0`       | root dev tooling, `packages-web/*`, demo web (all via vite → less) |
| `GHSA-vfj7-8cjw-p6xm` | `braces`               | none            | root dev tooling (`.`) and `docs/site` only                        |
| `GHSA-ch52-4w7c-c8xp` | `http-cache-semantics` | none            | `docs/site` only                                                   |

`docs/site` is the private Docusaurus build of this documentation, and the
root workspace is private development tooling. Neither is published, and no
published or runtime STYNX package depends on `braces` or
`http-cache-semantics`.

## Decision

1. `probe-image-size` is fixed rather than excepted: a `pnpm.overrides` entry
   `probe-image-size@7` pins the patched 7.4.0.
2. `scripts/audit-workspace-dependencies.mjs` replaces direct `pnpm audit`
   calls:
   - The RC lane runs `pnpm security:audit`, which uses `--prod` and blocks
     every severity, unchanged.
   - The remote `dependency-audit` job uses `--audit-level=high`, unchanged.
3. The script accepts exactly `GHSA-vfj7-8cjw-p6xm` (braces) and
   `GHSA-ch52-4w7c-c8xp` (http-cache-semantics), and only while all of the
   following hold:
   - the date is on or before **2026-11-04**;
   - the advisory still has no patched release;
   - every reported path starts at `.` or `docs/site`.

   If any condition fails, the gate blocks again. Every other advisory blocks
   as before.

4. The exception is recorded in the script itself, following the
   `scripts/audit-cdk-dependencies.mjs` precedent (Owner exception of
   2026-10-01), and pinned by `test/scripts/audit-workspace-dependencies.test.mjs`.

## Consequences

- The `security` RC task and `dependency-audit` pass again. The gate keeps
  failing closed for every new or runtime-reachable advisory.
- Before 2026-11-04 the Owner must take one of three actions:
  - adopt a patched release once one exists;
  - remove the importer, for example by moving the documentation build off the
    affected Docusaurus line;
  - renew the exception with a new decision.

  Otherwise the gate blocks again on its own.

- Renewing or widening the exception requires a new ADR, a script change and a
  matching test change.
