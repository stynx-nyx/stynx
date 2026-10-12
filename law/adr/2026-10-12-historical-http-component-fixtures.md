---
adr_id: ADR-RELEASE-0003
title: Explicit historical HTTP component fixtures and preserved version refusal
status: accepted
date: 2026-10-12
authors: ['Architect']
tags: [release, fixtures, http, provenance, refusal]
---

# ADR-RELEASE-0003 — Historical HTTP component fixtures

## Context and scope

The canonical 1.6.0 candidate
`acc38ef5912573e5195b7529102d740831c996be` changed only the version row of
`packages/flow/package.json` from 1.5.7 to 1.6.0. HTTP component fixtures copied
that current manifest, while the internal HTTP observers intentionally require
the exact reviewed 1.5.7 physical resolution anchor. Workers correctly refused
it before startup; parser and worker fixtures consequently failed their positive
diagnostic cases. Preserve that candidate, its unit failure and every earlier
observation. This is not evidence of a product application startup failure.

The Owner's continuing publication and bounded spot-fix mandate permits
repairing the diagnostic fixture under
[ADR-RELEASE-0001](2026-10-11-bounded-1.6.0-publication.md). That scope explicitly
defers full HTTP/native/workload admission and records HTTP performance as
NOT_OBSERVED. It does not require broadening the HTTP observers' frozen anchors
or treating a historical component test as current runtime qualification.

## Decision

1. The Inspector retains the exact historical flow manifest as explicit committed
   diagnostic test data, obtained from reviewed immutable Git blob
   `db4b602b7b72ecc2c1ac4ba549b2f28793c74da5`. Verify its 1,827-byte length and
   SHA-256 `7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1`
   before use. Do not reconstruct it by changing the current manifest's version,
   omit other fields or rely on an unavailable historical checkout at test time.
2. Parser and worker component fixtures use those historical bytes only as
   explicitly nonattesting diagnostic inputs. Preserve all positive protocol
   behavior and negative witnesses. The fixture does not establish a producing
   build, current candidate identity, application effects, native custody,
   accepted performance, provider approval or release readiness.
3. Add an independent refusal witness using the actual canonical 1.6.0 manifest:
   SHA-256 `3946614be3f519c7da9e6a1c8e374efa25e589efab3baa6f7ba50bbef97c52e0`,
   Git blob `79aa37b2d5283ef7538bdd5af84dc982e9809113`, length 1,827 bytes.
   Prove refusal before startup with zero startup frames and no application
   effects. Preserve exact hash/blob/length, environment, Node and process
   checks; no version whitelist, normalization or caller authority is added.
4. Leave all four production HTTP observer modules and their physical pins
   unchanged. Never replace an actual candidate, private fresh-build or live
   application manifest with historical fixture data. Full HTTP admission for
   1.6.0 remains unsupported by these frozen anchors and requires its own future
   source review and independent proof. Disclose this deferred tooling boundary
   with the existing HTTP NOT_OBSERVED/readiness-false limitations.
5. Land test data, independent regressions and Architect trace through an
   ordinary protected parent PR; then generate a fresh direct-child canonical
   version candidate. Preserve the 107-path canonical version population,
   eleven pending Changesets, actual uniform root/all-44-package 1.6.0 checks,
   protected controls and existing API, security and coverage gates. Verify the
   actual Changesets status before another RC; add no unnecessary changeset.

The prohibition on synthetic manifest projection in ADR-DEVAI-ADOPTION-0019
continues to apply to actual feature/version admission. Explicit historical
diagnostic data supplies no such admission and cannot replace actual version
assertions. No test, threshold, runtime refusal or release gate is weakened.

## Acceptance

Independently run all six affected component suites at the unversioned parent
and in a prospective canonical 1.6.0 rehearsal. Require every retained assertion,
the fixture byte identities and the new early-refusal/no-effects witness. Bind
only actual changed assertion projections. Neither this decision nor passing
component tests asserts full RC, publication, HTTP qualification or audit PASS.
