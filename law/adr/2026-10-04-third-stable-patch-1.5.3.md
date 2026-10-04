---
adr_id: ADR-DEVAI-ADOPTION-0011
title: Release the fixed group as stable patch 1.5.3
status: accepted
date: 2026-10-04
authors: ['Architect']
tags: [stynx, release, versioning, devai]
---

# ADR-DEVAI-ADOPTION-0011 — Third stable patch 1.5.3

**Status:** Accepted.
**Authority:** The Owner's 2026-10-04 decision to release 1.5.3.
**Supersedes:** the 1.5.2 candidate target of `ADR-DEVAI-ADOPTION-0009`. That
candidate was never published.

## Context

Stable 1.5.0 is the published `latest` for all 44 fixed-group packages, and
`rc` remains 1.5.0-rc.2. Neither the 1.5.1 nor the 1.5.2 candidate was
published. Since the 1.5.2 version marker, eleven changesets have reached
`origin/main`:

- **Nine releasing patches:** the Angular 22.2.1 advisory, the 2026-10
  minor-and-patch refresh, SSE opt-in options, the SSE `Retry-After` fix,
  outbox event reads and retry, offline-sync listings and idempotent
  reservation, declarative QUALIFIED signatures, and `auth.sessions` partition
  maintenance and retention (ADR-SESSIONS-0002 and -0003).
- **Two test-only changesets** with no group release.

`pnpm release:preview` computes one fixed-group patch from 1.5.2 to 1.5.3. The
Changesets bot pull request `ci: version packages` (#340) bypasses this
governed lane and is closed as superseded.

## Decision

1. Consume all eleven changesets with `pnpm version-packages` in one marker
   commit, `chore(repo): version fixed group to 1.5.3`. The marker's parent has
   the root and all 44 packages at 1.5.2, exactly those eleven changesets
   pending, and no prerelease state. The marker changes exactly:
   - the eleven changeset deletions;
   - all 44 manifest and changelog pairs;
   - the generated version support paths.

   Its candidate has the root and all 44 packages at 1.5.3, no pending
   changeset, and no prerelease state.

2. Generalize the exact stable-patch classifier to bind the marker's exact
   changeset set. Preserve the historical 1.5.1 and 1.5.2 classifiers. After
   the marker, allow only the enumerated release-policy, test, trace and
   receipt follow-ups.
3. Rebind the registry anomaly exception to exactly 1.5.3. Keep the
   authenticated preflight `latest=1.5.0` and `rc=1.5.0-rc.2`, and keep
   angular-profile 2.0.0 as immutable non-canonical history. Rebind its digest
   in the Engineer verifier.
4. Run the full local CI and the signed local RC against one clean candidate
   SHA. An exact-main-SHA Owner receipt remains required before package
   publication.

## Consequences

Generating the version does not publish anything. A different version or any
extra changeset invalidates the exact classifier and needs another governed
decision.
