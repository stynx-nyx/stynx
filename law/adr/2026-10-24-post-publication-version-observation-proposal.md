---
adr_id: ADR-0036
title: Post-publication workspace and final release observations
status: accepted
date: 2026-10-24
authors: ['Architect']
---

# ADR0036 — Post-publication workspace and final release observations

This is an Architect applicability clarification under the user's existing
authorization to proceed with verification blockers and reconcile completed
release work. The coordinator reviewed this bounded disposition on 2026-10-24.
It records no new Owner approval, version selection or publication authority.
It preserves the completed 3.0.0 campaign and the existing S8 security changeset.
Implementation and independent verification remain required; this document
changes no source, test, manifest or publication policy.

## Observed blocker

The coordinated ordinary root test on S8 `e6684b480bdf56a5118f57113cdb42e0e3656584`
completed in approximately 20m54s with 96/97 tasks successful. Inspector reported
4,860 passing cases across 46 Vitest populations and Node results of 2,473/2,475.
One Node failure is a separate temporary-store artifact preparation problem.
The policy failure is the live call to `assertCampaignVersionStage(repoRoot)` in
`test/scripts/release-version-policy.test.mjs`: root version 3.0.0 selects its
`VERSIONED` branch, which requires zero stable pending changesets. The required
47-package S8 security patch changeset is valid post-publication development
metadata, but cannot satisfy that completed-campaign final-candidate assertion.
No complete ordinary-unit success or signed RC follows from this run.

## Existing authority and actual applicability

The coordinator independently refreshed the GitHub `v3.0.0` release as published
at `2026-10-23T13:00:35Z`, neither draft nor prerelease, and the local peeled tag
as `e66dab0679fab6da4a5d944a763a63329e900026`. This observation corroborates the
completed campaign; it does not replace all-package artifact evidence or grant
permission to republish. Historical release evidence remains preserved.

ADR0019's “Protected integration and version-stage observation” requires real
root/package observations for the prospective feature and generated version PR.
It says the versioned candidate must consume its pending changesets, retains
independent tests of both stages and prohibits release-context exemptions,
synthetic manifest projections, skips or a weaker final gate. Those requirements
remain binding. ADR-RELEASE-0006 advanced that campaign to the exact 47-package
3.0.0 release; it did not select a later S8/S10 version or authorize republishing.

The production paths already distinguish ordinary development from publication:

- `scripts/run-release-preparation.mjs` classifies actual commits after
  `origin/main`; the old version marker already on the base is not a new version
  PR. Its ordinary path runs release drafts after the existing security,
  provenance, policy, API and consumer-fixture checks. Version-marker paths retain
  their exact ancestry, package population, consumed-change and follow-up checks.
- Ordinary `scripts/verify-release-policy.mjs` validates the real unified
  workspace without demanding a prospective publication version. Registry mode
  additionally requires the policy candidate, exact package versions and
  `assertNoPendingPreChangesets` before authenticated registry observations.
- `scripts/publish-release-plan.mjs` also calls `assertNoPendingPreChangesets`.
  `scripts/lib/publication-dist-tag.mjs` rejects stable publication with pending
  changesets. None of these paths infer publication readiness from an ordinary
  source-plan observation.

The unit helper currently infers release purpose from version equality alone;
the production paths do not. Correcting that applicability under the already
authorized verification work requires no new release choice or publication
waiver, provided the following preservation conditions are met. A proposed
change to the actual final-stage or publication requirements would instead need
its own explicit authority and is outside this clarification.

## Bounded observation separation

1. Keep a live, nonpublishing workspace observation against the actual checkout.
   It must retain the exact 47 discovered package identities and cardinality,
   actual root and all package versions (currently 3.0.0), governed roster and
   fixed-group equality, duplicate/missing/extra refusal, absent prerelease
   state, internal and template range validation, and all existing registry
   policy/anomaly identity assertions. Do not substitute fixture manifests for
   these live observations or rewrite the historical registry target.
   Ordinary source-version uniformity must not require equality with the
   prospective registry target: valid unversioned source may differ from that
   target. Keep source state and policy identity as separate observed values;
   exact target equality remains a campaign/publication-purpose requirement.
2. Read and validate every actual pending changeset, including the existing
   acknowledgement rules, release declarations, supported package membership,
   duplicate declarations, ignored-package refusal and supported bump values.
   Keep actual file hashes and exact plan/census correspondence. The plan's
   current version must equal observed root/package state; its computed next
   version follows the unchanged fixed-group arithmetic. A null effective bump
   means no version advance; any declared release bump must produce the ordinary
   computed future version. Neither outcome chooses or authorizes that release.
   The required S8 security changeset remains present and unconsumed in this
   repair candidate, proved by candidate custody. No permanent live-test assertion
   requires that filename or a patch-only plan after legitimate consumption or
   later development. Preserve its exact bytes as a historical Inspector fixture
   for the strict final-candidate refusal controls.
3. Label this result as a workspace/development observation, never `VERSIONED`,
   released, publication-ready or a new campaign target. Do not infer a new
   permitted campaign stage merely from pending changesets, version equality or
   an environment flag. Preserve the historical campaign helper's strict
   PREVERSION and VERSIONED behavior and its independent actual-file fixtures.
   Fixture evidence demonstrates those predicates; it does not stand in for the
   live checkout or completed-publication evidence.
4. Preserve the final-candidate live production gates. The actual version PR and
   publication paths must continue to require their exact candidate identities,
   complete root/all-47 version equality, consumed changesets, direct-parent
   version marker, reviewed follow-up population and registry/publication
   controls. Do not change `classifyReleaseContext`, version-candidate
   predicates, registry policy, `assertNoPendingPreChangesets`, publication
   scripts or release-scope permissions to make the development observer pass.
5. Keep the published 3.0.0 history as history. The new observation is not proof
   of registry contents or artifact publication and does not mutate receipts,
   governance runtime state, version/changelog/manifests, release policy or
   changeset consumption. A later real version campaign needs its separately
   approved version and normal exact-candidate controls.

Shared read-only observation code may avoid duplication, but separating the
purposes must not remove any common live assertion. In particular, extracting
only fixture-based final checks while dropping the actual live 47-manifest,
policy, range or changeset census is not this design.

## Inspector acceptance plan

- Observe the real S8 checkout: all 47 current manifest versions remain 3.0.0,
  all policy/roster/range checks apply, the security changeset remains intact and
  participates in the exact fixed-group plan. The result claims no publication.
- Preserve every existing PREVERSION/VERSIONED positive and negative campaign
  fixture, including unconsumed stable final changesets and the campaign-specific
  acknowledgement, invalid/missing plans, unsupported bump/package, wrong
  uniform source, every individual final package-version mismatch, root mismatch,
  invalid prestate, fixed-group/roster drift, stale internal/template ranges and
  disagreeing anomaly targets. Do not change their expected failures to passes.
- Add post-publication development fixtures with a valid pending patch, minor
  and major plan, and a no-effective-release state. The version arithmetic is
  tested without selecting any of those releases. Keep corresponding malformed
  changeset, unknown/ignored/duplicate package, drifted root/package, roster,
  prestate, template/range and policy negatives. Include a valid uniform actual
  source version different from the prospective policy target; mixed source
  versions still fail. Verify inputs remain unchanged.
- Use an Inspector-owned historical copy of the exact S8 security changeset,
  with original-byte digest/provenance, rather than reading a future live filename
  that legitimate versioning will consume. For the same versioned fixture tree
  plus those pending stable bytes, require ordinary
  development observation to describe its pending plan, strict VERSIONED
  observation to reject it, and the real publication pending-changeset guard to
  reject it. No purpose selector may alter the publication guard.
- Retain actual production-classifier fixtures: ordinary commits after an
  already-integrated release are ordinary; a version marker must satisfy its
  exact ancestry/consumption/follow-up contract. Verify registry mode and
  publish-release-plan still invoke the strict real pending-changeset guard.
  The actual registry verifier must run in an owned fixture containing the exact
  production source/module closure and manifest/license/config inputs, with
  deterministic pending bytes and explicit network refusal. Do not derive its
  expected rejection from whichever live changesets happen to exist. Ordinary
  CLI success remains an actual executable observation; fixture results are
  labeled as fixtures and never substitute for live manifest observations.
- Run the complete release-version-policy cohort after the role checkpoint,
  then normal exact-candidate signed RC under coordinated resource ownership. Its
  required `test:unit` node executes the complete unchanged root `pnpm test`; that
  full-root observation satisfies this requirement without a redundant standalone
  run beforehand. No required node, cache policy, command or environment control
  is skipped or overridden. An isolated pass does not repair the earlier full
  result.

## Scope and ownership

Architect owns this disposition and final trace binding. Inspector owns the
observation/regression change in the existing test file; Engineer owns any
necessary reusable production implementation, if later review demonstrates one
is required. The source review above predicts no production gate change is
needed; that is not a runtime verification claim. Preserve all prior failures and
approvals. S8 → S7 → S10 A+B → checkpointed C+D remains the integration order.
ADR0034, supplemental archive types, release-line assessment, publication and
DETRAN/PORM acceptance remain separate. The already-reviewed applicability correction requires no new Owner approval.
Any implementation that changes a production publication gate or drops a live
observation instead exceeds this disposition and must return for review.

## Implementation and focused verification checkpoint

Inspector checkpoints `70c1ff0070dc172961c391c6ea55c67bd5eaa9d9` and
`1b3bc5bbabb2cd1c110c77938bbec479071f4bee` implement this separation. The
complete policy cohort passed **137/137**, with zero skipped or cancelled cases,
in 36.17 seconds (`inspector/adr0036-release-version-lifecycle.log`). The strict
`assertCampaignVersionStage` helper is byte-identical to the pre-repair source;
Architect independently compared the extracted function bodies. Historical S8
security bytes are preserved in
`test/fixtures/release-policy/s8-security-patch.md`, while the actual pending
security changeset remains unchanged. Live observation no longer requires that
filename, a patch-only plan or source equality with the prospective policy target.

The actual verifier runs against the live workspace in ordinary mode and an
isolated deterministic pending fixture in registry mode. Exact production modules
and manifest/license/config inputs are copied without source extraction; a child
fetch guard forbids network, and registry refusal occurs at the pending-change
gate. These are focused executable observations, not registry-publication evidence.

Relative to `e6684b480bdf56a5118f57113cdb42e0e3656584`, the two Inspector
commits change only the owned policy test and historical fixture. The actual
ADR0035 route repair in `docs/meta/development-contract.md`, root/package
versions, changesets, lock and production release/publication guards remain
unchanged. Architect binds only the changed test projection (479 → 566) under
its existing invariant link. Final full-root and exact-candidate signed-RC
results remain pending; the earlier failed runs remain failed.
