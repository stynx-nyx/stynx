---
adr_id: ADR-DEVAI-ADOPTION-0007
title: Admit a replacement local RC signer after workstation key loss
status: accepted
date: 2026-09-27
authors: ['Architect']
tags: [stynx, devai, security, governance]
---

# ADR-DEVAI-ADOPTION-0007 — Recover the local RC signer

**Status:** Accepted.
**Authority:** The Owner's explicit authorization to complete the current RC
campaign after the admitted workstation-02 private key and controls became
unavailable.
**Amends:** `ADR-DEVAI-ADOPTION-0004` (signer admission) and
`ADR-DEVAI-ADOPTION-0006` (the first replacement-signer merge only).

## Context

`verified-local-rc` is required on `main`, and its trust store currently admits
only `stynx-inspector-workstation-02`. The corresponding private key and
workstation controls are unavailable. No receipt can be produced for a changed
candidate by that signer. A commit admitting a replacement signer therefore
cannot obtain its own required check through the existing trust path. Loss of
access does not, by itself, establish key compromise.

## Decision

1. Admit `stynx-inspector-workstation-03` with the Ed25519 public key in
   `law/policy/devai-local-rc-trust-store.json`. Its private key and public-key
   file are held outside the repository under the local workstation's
   `~/.local/share/stynx/rc-signer-03/` directory. The private key is restricted
   to its custodian and must never enter STYNX, Git, GitHub, a receipt, or a log.
   The signer ID used by the RC exporter and publisher must match the admitted
   ID before a receipt is attempted.
2. Preserve workstation-02's public-key admission and historical evidence.
   Its private key is inaccessible, but there is no evidence here of compromise
   or misuse. If custody investigation finds compromise, the Owner must make a
   separate revocation decision and assess affected receipts. Retaining its
   admission does not authorize use of an unaccounted-for private key.
3. Allow one Owner-directed bootstrap exception solely for the exact merge that
   admits workstation-03 and aligns the RC exporter and publisher with its
   signer ID. The Owner-controlled action must identify the actor, pull request,
   exact commit and tree, affected `main` ref, reason, and recovery evidence
   before execution, following Decision 8 of `2026-08-24-ci-economy.md`. The
   exception applies only to the unsatisfiable `verified-local-rc` required
   check for that merge; all other required checks and review requirements must
   pass. Record the action and post-condition afterward. No standing bypass,
   general relaxation of branch protection, or release-tag exception follows.
4. After the bootstrap merge, prepare and publish a fresh signed RC receipt for
   the exact resulting candidate with workstation-03. Verify
   `verified-local-rc` on the pull-request head or exact-tree `main` candidate
   as applicable, and confirm the ordinary required-check policy remains in
   force before any further merge or release claim. If the new signer, local
   controls, publication, or remote verification fails, the campaign remains
   blocked pending correction; the bootstrap exception cannot be reused.

## Consequences

- Historical receipts retain their original signer identity. The new public
  key admits future receipts without rewriting old evidence.
- Trust in workstation-03 proves signer identity and receipt integrity under
  the existing verification contract. It does not independently reproduce the
  local RC run.
- The temporary bootstrap action is auditable as an exact Owner exception. It
  does not convert an unverified merge into RC readiness.
