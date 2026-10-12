---
adr_id: ADR-RELEASE-0002
title: Canonical storage version materialization and validated API metadata
status: accepted
date: 2026-10-12
authors: ['Architect']
tags: [release, versioning, generated-consistency, public-api]
---

# ADR-RELEASE-0002 — Storage version materialization

## Context and authority

The Owner authorized completing STYNX 1.6.0 publication, preserving completed
work and repairing concrete failures without weakening assertions or gates.
The failed canonical version candidate
`b6093b7c1ebbbc0a129b21f93517a23008031b20` correctly failed the offline storage
artifact equality assertion: its package manifest was 1.6.0 while its generated
storage template still declared 1.5.7. Outbox had the same omitted generation
step. Preserve that candidate, PR #380 and its actual failure evidence.

The existing offline and outbox storage generators already derive
`packageVersion` from the owning package manifest. The canonical version helper
did not invoke them. Their exported constant declarations also include that
version as a literal, so ordinary version metadata changes two API baseline
hashes even when every storage contract byte is otherwise unchanged.

This is a producer repair under the unchanged correctness requirements of
[ADR-RELEASE-0001](2026-10-11-bounded-1.6.0-publication.md), not a release-gate
exception or an intended structural API change.

## Decision

1. Land the producer, admission checks, independent regressions and Architect
   bindings through an ordinary protected parent repair PR. Then generate a
   fresh canonical version commit directly on the actual merged main. Preserve
   the existing direct-parent rule, role separation, historical version
   classifiers and all previous work. Do not append hidden producer changes to
   a `ci: version packages` commit.
2. Canonical versioning invokes the existing
   `scripts/offline-storage-generate.mjs --write` and
   `scripts/outbox-storage-generate.mjs --write` using the declared Node
   interpreter after version synchronization and validation, before SBOM
   generation. Do not rewrite migrations, generate a new storage contract,
   or substitute manual edits for either supported generator.
3. For ordinary canonical version candidates, admit only modified
   `packages/offline-sync/src/storage-template.generated.ts` and
   `packages/outbox/src/storage-template.generated.ts` as the additional
   generated support paths. The actual runner reads their base and version
   marker Git-object bytes and the corresponding manifest versions. Require
   the exact known generated header/export and one anchored top-level
   `packageVersion` row in each template. Its old and new values must match
   the respective actual manifest versions. Replacing that row alone in the
   old body must reproduce the complete new body byte for byte. Missing,
   duplicate, stale or mismatched rows, altered source digests, SQL, bindings,
   catalog or other bytes, wrong statuses and follow-up changes refuse.
   Do not broaden shared historical marker path populations.
4. Public API hashing may normalize only the version literal in these exact
   emitted declaration tuples:

   | Package                   | Declaration path within dist                       | Constant                   |
   | ------------------------- | -------------------------------------------------- | -------------------------- |
   | `@stynx-nyx/offline-sync` | `offline-sync/src/storage-template.generated.d.ts` | `OFFLINE_STORAGE_TEMPLATE` |
   | `@stynx-nyx/outbox`       | `outbox/src/storage-template.generated.d.ts`       | `OUTBOX_STORAGE_TEMPLATE`  |

   Require the exact declaration header and exactly one anchored top-level
   readonly `packageVersion` literal, equal to the actual owning package
   manifest version. Only then replace its value with a fixed metadata sentinel
   for hashing. Missing, duplicate, stale or mismatched literals refuse; all
   remaining bytes use the existing newline/trim normalization and hash.
   Every other package and declaration retains its existing byte hash.
   `contractVersion`, source identities, SQL, types, bindings, exported names,
   declarations and package exports remain compatibility-bearing.

5. The Architect regenerates the parent public API baseline through
   `pnpm api:baselines:write` after reviewing the normalizer. Exactly the two
   declaration hashes above may change in that rebind. The final version
   commit therefore needs no API baseline path admission or blanket baseline
   regeneration. Actual emitted version literals and runtime artifact versions
   continue to match their manifests; normalization does not modify either.

## Acceptance and preserved limits

Inspector regressions must demonstrate correct metadata across real version
changes, refusal of wrong/stale/missing/duplicate identities, and retained
structural hash sensitivity. Exercise canonical generation and Git-bound
admission with both positive version-only changes and negative SQL, source
digest, bindings, extra path, status and follow-up changes. Retain every prior
artifact equality assertion and all API, generated consistency, coverage and
protected release gates. Rebind actual test projections separately under
Architect authority.

The repair grants no publication success, provider approval, full audit PASS,
HTTP performance evidence or new exception to the bounded 1.6.0 scope. Final
publication still requires its fresh exact-candidate RC, protected integration
and independent artifact verification.
