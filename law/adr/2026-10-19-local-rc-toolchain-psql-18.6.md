---
adr_id: ADR-DEVAI-ADOPTION-0025
title: Rebind the local RC workstation toolchain to Postgres.app psql 18.6
status: accepted
date: 2026-10-19
authors: ['Architect']
tags: [stynx, devai, release, security]
---

# ADR-DEVAI-ADOPTION-0025 — Rebind the local RC toolchain to psql 18.6

**Status:** Accepted.
**Authority:** Owner direction ("Re-pin the law to 18.6") to sign the local RC for the DEVAI v3 wave-1 candidate (#400).
**Amends:** `ADR-DEVAI-ADOPTION-0008` only for the current workstation-03 `postgres` toolchain value.

## Context

Postgres.app on workstation-03 updated its bundled PostgreSQL 18 from 18.2 to 18.6. The local RC preparer compares the toolchain control byte for byte and would fail closed: the law control records `psql (PostgreSQL) 18.2 (Postgres.app)` while the installed binary reports `psql (PostgreSQL) 18.6 (Postgres.app)`. Node v24.20.0, pnpm 9.15.0, TypeScript 6.0.3 and Vitest 4.1.11 are unchanged.

## Decision

1. Regenerate the control with `node scripts/devai-local-rc.mjs controls` under the workstation-03 toolchain (Postgres.app 18 `bin` first on PATH, Node v24.20.0) and rebind `law/policy/devai-local-rc-toolchain.json` to those bytes. The only changed value is `postgres`; nothing is inferred or bypassed.
2. The external workstation-03 toolchain control (`DEVAI_RC_TOOLCHAIN`) must carry the same bytes before the next `prepare`.
3. Signer, trust store, private-key custody, environment control, RC task roster and exact-candidate verification are unchanged.

## Consequences

Historical receipts keep their recorded toolchain. Future workstation-03 receipts are admitted with psql 18.6. No publication, workflow-edit or bypass permission is granted.
