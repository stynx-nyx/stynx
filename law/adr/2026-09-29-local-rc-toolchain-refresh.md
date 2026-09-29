---
adr_id: ADR-DEVAI-ADOPTION-0008
title: Rebind the local RC workstation toolchain after supported updates
status: accepted
date: 2026-09-29
authors: ['Architect']
tags: [stynx, devai, release, security]
---

# ADR-DEVAI-ADOPTION-0008 — Rebind the local RC toolchain

**Status:** Accepted.
**Authority:** Owner direction to close the remaining signed local RC evidence debt for the STYNX 1.5.1 candidate.
**Amends:** `ADR-DEVAI-ADOPTION-0007` only for the current workstation-03 toolchain control.

## Context

The admitted workstation-03 environment control still matches the live local environment exactly. The local RC preparer fails closed on its toolchain comparison: the law control records Node v24.15.0 and `psql` 18.1, while the installed supported binaries report Node v24.20.0 and `psql` 18.2. pnpm 9.15.0, TypeScript 6.0.3 and Vitest 4.1.11 remain unchanged. The PostgreSQL server is the intended local Postgres.app 18.2 service reached through `localhost`; the Docker Desktop IPv4 proxy remains excluded.

## Decision

1. Generate the current control with `node scripts/devai-local-rc.mjs controls` under the admitted workstation-03 environment. Rebind `law/policy/devai-local-rc-toolchain.json` to that generated control and use the same bytes in the external workstation-03 control file. No control value is inferred or bypassed.
2. Preserve the admitted signer, trust store, private-key custody, environment digests, RC task roster and exact candidate verification. The RC preparer must continue to compare both controls byte for byte before running.
3. Run the signed local RC only from a clean exact candidate after coverage and the full release gates pass. Record the observed toolchain, candidate SHA, receipt digest and remote verification outcome in R-0003.

## Consequences

Historical receipts retain their original toolchain and signer evidence. This decision admits the updated local binaries only for future workstation-03 receipts; it grants no publication or workflow-edit permission.
