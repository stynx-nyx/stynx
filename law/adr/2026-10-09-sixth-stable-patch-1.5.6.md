---
adr_id: ADR-DEVAI-ADOPTION-0016
title: Release the fixed group as stable patch 1.5.6
status: accepted
date: 2026-10-09
authors: ['Architect']
tags: [stynx, release, versioning, detran]
---

# ADR-DEVAI-ADOPTION-0016 — Sixth stable patch 1.5.6

**Status:** Accepted.
**Authority:** The Owner's 2026-10-09 direction to implement every DETRAN
1.5.x request that is decided and needs no DETRAN action, shipping the
no-migration work first as a patch (slice 2, step 1).
**Supersedes:** the 1.5.5 candidate target of `ADR-DEVAI-ADOPTION-0015`,
which was published on 2026-10-09 and is the base of this decision.

## Context

Stable 1.5.5 is the published `latest` for all 44 fixed-group packages, tagged
`v1.5.5` on the main commit `1a03a915`, and `rc` remains 1.5.0-rc.2. Since
that marker the following changesets have reached `origin/main`:

- `.changeset/ngsse-open-status.md` — `@stynx-nyx/angular` patch: opt-in
  `StynxEventStreamConfig.openStatus` (UPS-NGSSE-13 item 3).
- `.changeset/outbox-named-destinations.md` — `@stynx-nyx/outbox` patch: named
  destinations over the entity selector (UPS-OBX-11, ADR-OUTBOX-0003 D4).
- `.changeset/signature-trust-profile-sets.md` — `@stynx-nyx/signature` patch:
  several trust profiles in one module (UPS-SIG-07, ADR-SIGNATURE-0002 D2).
- `.changeset/offline-sync-1-5-6-slice.md` — `@stynx-nyx/offline-sync` patch:
  per-item integrity rejection, device filter, numbering sentinel and the
  named V-tests (UPS-OFS-10/11/12/14, ADR-MOBILE-OFFLINE-0003 D4 and D5).

Each one closes or advances a DETRAN C-0002/R-0022 request under a decision
already recorded: UPS-NGSSE-13 item 3 (no ADR needed, Owner comment of
2026-10-06 on #321), UPS-OBX-11 (ADR-OUTBOX-0003 D4), UPS-SIG-07
(ADR-SIGNATURE-0002 D2, with the Owner's 2026-10-09 confirmation of open
points 5 and 6 and of a second test PKI root), and UPS-OFS-10, -11, -12 and
-14 (ADR-MOBILE-OFFLINE-0003 D4 and D5). None adds a platform migration; the
migration-bearing requests (UPS-OBX-10, UPS-OFS-06/07/08) follow in the next
patch. `pnpm release:preview` computes one fixed-group patch from 1.5.5 to
1.5.6.

## Decision

1. Consume the changesets above with `pnpm version-packages` in one marker
   commit, `chore(repo): version fixed group to 1.5.6`. The marker's parent has
   the root and all 44 packages at 1.5.5, exactly those changesets pending, and
   no prerelease state. The marker changes exactly the changeset deletions, the
   44 manifest and changelog pairs, and the generated version support paths.
2. Preserve the historical 1.5.1 to 1.5.5 classifiers. Add a distinct exact
   1.5.6 classifier bound to the sixth marker over the published 1.5.5 base,
   wired ahead of the fifth in release preparation, and allow after the marker
   only the enumerated release-policy, test and law follow-ups.
3. Rebind the registry anomaly exception to exactly 1.5.6, moving the
   authenticated preflight to `latest=1.5.5`, keeping `rc=1.5.0-rc.2` and the
   immutable noncanonical angular-profile 2.0.0 observation. Rebind its digest
   in the Engineer verifier and admit the 1.5.6 root version in the frozen
   manifest normalization.
4. The candidate ships with its scorecard observation recorded at the exact
   published SHA (`ADR-DEVAI-ADOPTION-0014` protocol) and cited in the release
   notes; the observation bundle is committed as evidence after publication.
5. Run the full local CI, release gates and the signed local RC against one
   clean candidate SHA. An exact-main-SHA Owner receipt remains required
   before package publication.

## Consequences

Version generation does not publish packages. A changed version or extra
changeset invalidates the exact classifier and needs another governed decision.
After publication the Owner records on #321, #320, #318 and #317 which IDs the
release closes, with symbols, tests and deviations, and closes #321.
