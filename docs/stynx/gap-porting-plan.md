# Gap-Porting Plan: pec/porm excellence → stynx

**Date:** 2026-04-26  
**Source analysis:** cross-repo comparison of porm, pec, sgp, stynx  
**Status:** complete for `GAP-001..006`; release-readiness follow-ups remain tracked in `TODO.md`

## Context

stynx is the shared runtime platform for porm, pec, and sgp. Six gaps were
identified where peer repos have stronger, production-tested implementations
that should become the canonical stynx behaviour.

## Gaps

| ID      | Severity   | Package                     | Feature                                                    |
| ------- | ---------- | --------------------------- | ---------------------------------------------------------- |
| GAP-001 | CRITICAL   | `packages/audit`            | Append-only audit with cryptographic hash chaining         |
| GAP-002 | MEANINGFUL | root tooling                | Dead-code and orphaned-dep detection in CI                 |
| GAP-003 | MEANINGFUL | `packages/core`             | Per-variable ownership metadata in config schema           |
| GAP-004 | MEANINGFUL | `packages/sessions`         | Tenant-switch without logout (session exchange)            |
| GAP-005 | MEANINGFUL | `packages/storage`          | S3 Object Lock, lifecycle rules, presign rate limiting     |
| GAP-006 | MINOR      | `packages/ratelimit` + auth | SLO latency histogram + proactive permission drift re-sync |

## Execution order

Run prompts in order: GAP-001 → GAP-002 → GAP-003 → GAP-004 → GAP-005 → GAP-006.  
Each prompt is self-contained and can be re-run independently.

## Acceptance

All six gaps are closed when:

- `pnpm build` passes across all affected packages
- `pnpm test:unit` passes
- `pnpm test:int` passes (requires PostgreSQL 16)
- `pnpm lint` passes with zero warnings
- `pnpm lint:deadcode` passes
- `pnpm lint:deps` passes
