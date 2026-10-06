---
adr_id: ADR-DEVAI-ADOPTION-0012
title: Release the fixed group as stable patch 1.5.4
status: accepted
date: 2026-10-06
authors: ['Architect']
tags: [stynx, release, versioning, devai]
---

# ADR-DEVAI-ADOPTION-0012 — Fourth stable patch 1.5.4

**Status:** Accepted.
**Authority:** The Owner's 2026-10-06 decision to release 1.5.4.
**Supersedes:** the 1.5.3 candidate target of `ADR-DEVAI-ADOPTION-0011`. That
candidate was published on 2026-10-05 and is the base of this decision.

## Context

Stable 1.5.3 is the published `latest` for all 44 fixed-group packages, tagged
`v1.5.3` on the main commit `2505251f`, and `rc` remains 1.5.0-rc.2. Neither
the 1.5.1 nor the 1.5.2 candidate was ever published. Since the 1.5.3 version
marker, four changesets have reached `origin/main`:

- **Two releasing patches:** the opt-in SSE server-close policy and the fake
  transport fix in `@stynx-nyx/angular` (UPS-NGSSE-12), and outbox event
  destinations with filtered dispatch in `@stynx-nyx/outbox` (UPS-OBX-07).
- **Two empty changesets** with no group release: the generated dependency
  pointer in the package READMEs and the serialized test tier.

The tree also carries the 2026-10-06 advisory pins (root overrides only, no
changeset) and three ADR amendments (documentation only). `pnpm release:preview`
computes one fixed-group patch from 1.5.3 to 1.5.4.

## Decision

1. Consume all four changesets with `pnpm version-packages` in one marker
   commit, `chore(repo): version fixed group to 1.5.4`. The marker's parent has
   the root and all 44 packages at 1.5.3, exactly those four changesets
   pending, and no prerelease state. The marker changes exactly:
   - the four changeset deletions:
     `.changeset/ngsse-server-close-policy.md`,
     `.changeset/outbox-event-destinations.md`,
     `.changeset/readme-generated-dependency-pointer.md` and
     `.changeset/serialize-db-backed-specs.md`;
   - all 44 manifest and changelog pairs;
   - the generated version support paths.

   Its candidate has the root and all 44 packages at 1.5.4, no pending
   changeset, and no prerelease state.

2. Add a fourth exact stable-patch classifier with the same shape as the third,
   binding the marker's exact changeset set over the published 1.5.3 main as
   base. Preserve the historical 1.5.1, 1.5.2 and 1.5.3 classifiers. After the
   marker, allow only the enumerated release-policy, test, trace and receipt
   follow-ups.
3. Rebind the registry anomaly exception to exactly 1.5.4. Move the
   authenticated preflight to the published state, `latest=1.5.3`, keep
   `rc=1.5.0-rc.2`, and keep angular-profile 2.0.0 as immutable non-canonical
   history. Rebind its digest in the Engineer verifier.
4. Run the full local CI and the signed local RC against one clean candidate
   SHA. After the merge, publication follows as a separate Owner-gated step: an
   exact-main-SHA Owner receipt, the Release workflow dispatched with
   `publish: true` under `STYNX_ENABLE_REGISTRY_PUBLISH`, the annotated
   `v1.5.4` tag and its GitHub release, and the switch returned to `false`.

## Consequences

Generating the version does not publish anything. A different version or any
extra changeset invalidates the exact classifier and needs another governed
decision.
