---
adr_id: ADR-DEVAI-ADOPTION-0015
title: Release the fixed group as stable patch 1.5.5
status: accepted
date: 2026-10-08
authors: ['Architect']
tags: [stynx, release, versioning, devai, scorecard]
---

# ADR-DEVAI-ADOPTION-0015 — Fifth stable patch 1.5.5

**Status:** Accepted.
**Authority:** The Owner's 2026-10-08 decision (D1 and D2 of
`ADR-DEVAI-ADOPTION-0013`) that the next published version carries DEVAI 2.3.0
and the first measured scorecard, and that one governance patch changeset
advances the fixed group.
**Supersedes:** the 1.5.4 candidate target of `ADR-DEVAI-ADOPTION-0012`. That
candidate was versioned on `main` on 2026-10-06 and never published; it joins
1.5.1 and 1.5.2 as auditable history.

## Context

Stable 1.5.3 remains the published `latest` for all 44 fixed-group packages,
tagged `v1.5.3` on the main commit `2505251f`, and `rc` remains 1.5.0-rc.2.
The 1.5.4 marker (`5ba587ea`) consumed four changesets, but the DEVAI 2.3.0
adoption that followed it (`ADR-DEVAI-ADOPTION-0013`) changes the root
manifest, the lockfile, `.devai/config` and the verifier workflow, none of
which the exact 1.5.4 classifier admits after its marker. Since that marker,
one changeset has reached `origin/main`: the `@stynx-nyx/pdf` handlebars patch
(4.7.9 → 4.7.10) that closes GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f and
GHSA-xw65-4hp5-5hc7 for published consumers. `pnpm release:preview` computes
one fixed-group patch from 1.5.4 to 1.5.5.

## Decision

1. Consume the one changeset with `pnpm version-packages` in one marker
   commit, `chore(repo): version fixed group to 1.5.5`. The marker's parent has
   the root and all 44 packages at 1.5.4, exactly that changeset pending, and
   no prerelease state. The marker changes exactly the changeset deletion, the
   44 manifest and changelog pairs, and the generated version support paths.
2. Preserve the historical 1.5.1 to 1.5.4 classifiers. Add a distinct exact
   1.5.5 classifier bound to the fifth marker over the 1.5.4 main base, wired
   ahead of the fourth in release preparation, and allow after the marker only
   the enumerated release-policy, test and law follow-ups.
3. Rebind the registry anomaly exception to exactly 1.5.5, keeping the
   authenticated preflight `latest=1.5.3`, `rc=1.5.0-rc.2`, and the immutable
   noncanonical angular-profile 2.0.0 observation. Rebind its digest in the
   Engineer verifier and admit the 1.5.5 root version in the frozen manifest
   normalization.
4. The candidate ships with the scorecard recorded under
   `ADR-DEVAI-ADOPTION-0014`: the Inspector records the sweep at the exact
   candidate SHA, the Auditor observes it, the release notes cite the `SC-`
   id, and the observation bundle is committed as evidence after publication.
5. Run the full local CI, release gates and the signed local RC against one
   clean candidate SHA. An exact-main-SHA Owner receipt remains required
   before package publication.

## Consequences

The unshipped 1.5.4 candidate remains auditable history. Version generation
does not publish packages. A changed version or extra changeset invalidates
the exact classifier and needs another governed decision.
