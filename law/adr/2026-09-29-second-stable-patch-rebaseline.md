---
adr_id: ADR-DEVAI-ADOPTION-0009
title: Rebaseline the exact fixed group after the merged session policy patch
status: accepted
date: 2026-09-29
authors: ['Architect']
tags: [stynx, release, versioning, devai]
---

# ADR-DEVAI-ADOPTION-0009 — Second stable patch rebaseline

**Status:** Accepted.
**Authority:** OD-R0003-02 and the Owner's standing direction to complete the STYNX campaign, excluding DETRAN proofs.
**Amends:** The R-0003 release candidate target after the independently approved session-policy HTTP patch entered `origin/main`.

## Context

The first postrelease changeset advanced all 44 publishable packages from 1.5.0 to the historical, unpublished 1.5.1 candidate. A later merge of `origin/main` introduced `.changeset/session-policy-http-status.md` and its implementation. The 1.5.1 release context correctly fails closed: the new changeset is pending and the merged source changes do not fit its bounded follow-up list. `pnpm release:preview` computes one fixed-group patch from 1.5.1 to 1.5.2.

## Decision

1. Consume the session-policy changeset with `pnpm version-packages`. The resulting second marker has subject `chore(repo): version fixed group to 1.5.2`; its parent has root and all 44 package versions at 1.5.1, exactly the session-policy changeset pending, no prerelease state, and its commit changes exactly that changeset deletion, all 44 manifest/changelog pairs, and the six generated version support paths. Its candidate has root and all 44 packages at 1.5.2, no pending changeset, and no prerelease state.
2. Preserve the historical 1.5.1 classifier. Add a distinct exact 1.5.2 classifier bound to the second marker and allow only R-0003 evidence paths and expressly enumerated release-policy/test follow-ups after that marker. Reject source, workflow, package, and unrelated law mutations after the marker.
3. Rebind the registry anomaly exception to exactly 1.5.2, keeping the authenticated preflight `latest=1.5.0`, `rc=1.5.0-rc.2`, and the immutable noncanonical angular-profile 2.0.0 observation. Rebind its digest in the Engineer verifier.
4. Run the full local CI, all-package exact coverage, release gates, cross-family delivery review, and signed local RC against one clean candidate SHA. An exact-main-SHA Owner receipt remains required before package publication.

## Consequences

The unshipped 1.5.1 candidate remains auditable history. Version generation does not publish packages. A changed version or extra changeset invalidates the exact classifier and needs another governed decision.
