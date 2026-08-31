# STYNX 1.1.x Release and Adoption Readiness

The historical v1.0 Prompt 37 readiness review was **closed** on 2026-04-27 under the revised
no-cloud-secret artifact scope. AWS/ECR push and Cosign signing are no longer
Prompt 37 gates; reference app image scans and SBOM generation are owned by the
reference-app workflow instead of the STYNX package release lane.

## Implemented release-prep surfaces

- Major `1.0.0` changeset stubs for every publishable workspace package under `.changeset/`.
- Root and package `BUSL-1.1` licensing for the 1.1.x line.
- Release policy verification script:
  - `pnpm release:policy`
- Security release lane:
  - `pnpm security:release`
  - `pnpm security:sbom`
  - `pnpm security:licenses`
  - `pnpm security:secrets`
- Changeset status + release draft generation:
  - `pnpm release:status`
  - `pnpm release:drafts`
- Release-prep GitHub Actions workflow:
  - Semgrep
  - dependency audit
  - package policy verification
  - release draft artifact generation
- Reference app GitHub Actions workflow:
  - reference API build and test lane
  - reference web E2E lane
  - Trivy image scans
  - Syft SBOM generation
- Reference-app image artifact checks:
  - build reference API and web images locally on the runner
  - run Trivy vulnerability scans
  - generate and upload Syft SBOM artifacts
- ADRs remain published in the docs site under `Architecture Decisions`.
- The v1.1 planning issue template is staged under `.github/ISSUE_TEMPLATE/v1_1_planning.md`.

## Flow Package Addendum (2026-05-17)

The PORM-to-STYNX Flow gap pass added release-visible package evidence for:

- `@stynx-nyx/flow`: backend package build/test coverage, platform migrations `0015_flow_gap_closure.sql` and `0016_platform_curated_audit.sql`, answer/waiver mutation signal freshness, curated-table DML audit coverage, reference API import via `StynxFlowModule`, and release changeset `.changeset/flow-gap-closure.md`.
- `@stynx-nyx/angular-flow`: Angular package tests with `passWithNoTests` removed, API facade coverage for the Flow contract, typed fill execution controls, reference web route mount under `/flow`, route-access E2E seed, and release changeset `.changeset/flow-gap-closure.md`.
- Flow deprecation-readiness evidence: reference API HTTP-pipeline coverage for Flow guards, request context, idempotency replay, audit writes, form answer/waiver execution, signal freshness, task assignment/action, and analytics smoke; reference-web generic route E2E coverage for forms, fills, assignments, waivers, open tasks, and run summary; and the consuming-repo cutover plan in [porm-flow-deprecation-readiness.md](porm-flow-deprecation-readiness.md).

This addendum is factual package-readiness evidence only. It does not change the v1.0 release-scope notes below or assert registry publication.

## Closure Evidence

The CI-authoritative gates that blocked Prompt 37 are green on `main`:

| Gate                                                          | GitHub Actions run | Result                        |
| ------------------------------------------------------------- | -----------------: | ----------------------------- |
| STYNX CI framework lane                                       |      `24976849184` | success                       |
| Reference app lane, including Linux `reference-web-e2e`       |      `24976849184` | success before workflow split |
| Docs, including Chrome-backed Lighthouse                      |      `24972209610` | success                       |
| Hardening first k6 baseline seed                              |      `24973827712` | success                       |
| Hardening second k6 baseline comparison + mutation thresholds |      `24976855814` | success                       |
| Release Prep                                                  |      `24977530998` | success                       |
| Release workflow                                              |      `24976849172` | success                       |

## Scope Notes

The original Prompt 37 text included ECR push and Cosign signatures. That
requirement was intentionally removed from the v1.0 closure bar so release
readiness can be proven without repository AWS/ECR/Cosign secrets. Container
registry publication and keyless image signing can be restored as a later
deployment hardening task when those environments exist.

The release workflow owns package versioning through Changesets. Registry
publishing is intentionally opt-in. All 44 packages live under the
`@stynx-nyx/*` scope (owned by the `stynx-nyx` org), are published as private
GitHub Packages, and publish with
an explicit manual `STYNX Release` dispatch with `publish: true`, the
Owner-controlled `STYNX_ENABLE_REGISTRY_PUBLISH=true` repository opt-in, and
an appropriate `NPM_TOKEN`. A push to `main` is always forced into
non-publishing Changesets preparation mode, even while the repository opt-in
is enabled.

Consumers therefore need package-read authentication for
`https://npm.pkg.github.com` and an `@stynx-nyx` scope mapping; a public source
repository does not make the packages anonymously installable. Changing package
visibility is a separate Owner decision.

## Exact-main package and documentation publication

STYNX 1.1.1 is present for all 44 packages and `latest` resolves to `1.1.1`.
The 1.1.2 correction is a normal unified patch through Changesets. Neither the
package nor documentation lane publishes from a pull request or automatic
`main` push.

The one-time 1.1.1 unified rebaseline is historical and must not be reused.
Normal patch releases move the private root and the fixed group of 44 publishable
manifests together; private reference applications and internal tooling retain
their independent operational versions.

After a patch candidate reaches exact `main`, an
Owner-authorized `STYNX Release` dispatch must supply that full 40-character
commit as `candidate_sha`, set `publish: true`, and have the Owner-controlled
`STYNX_ENABLE_REGISTRY_PUBLISH=true` opt-in. The workflow fails if the authorized
commit, checked-out commit, or current `origin/main` differ. Registry credentials
are scoped to install and publication steps.

Documentation publication remains a local, human-authorized act as required by
DEVAI documentation governance. `node scripts/publish-docs-site.mjs prepare`
builds an exact `main` candidate with no tracked or untracked drift into an
external bundle and records the repository, commit, Git tree, every file
digest, and aggregate site digest.
`node scripts/publish-docs-site.mjs publish --manifest <external-manifest>
--signing-key <external-private-key> --confirm-publish` re-verifies that bundle
and advances the existing `gh-pages` branch with a signed commit only when the
Owner supplies the exact manifest and the local
`STYNX_ENABLE_PAGES_DEPLOY=true` opt-in. The private SSH signing key must remain
outside the repository, have a matching public key, and deny group and other
access. The publisher verifies the commit signature locally and records the
signer fingerprint in the external publication receipt. GitHub's separate
`Verified` badge depends on that public key also being registered as a signing
key and is not substituted for local verification. Signature verification
precedes every push and is repeated for an idempotent publication. CI validates
documentation freshness and the local publication contract but never publishes
the site.

Publication readiness is therefore established only after the unified-version
candidate is merged, exact-main checks pass, and the Owner names the exact
commit in the package dispatch and local Pages authorization. Package and Pages
publication receipts must then be reconciled with that same commit before the
result is described as shipped. For 1.1.2 specifically, the release workflow
must publish and verify all 44 packages and push every tag itself; manual
continuation does not satisfy the release-lane acceptance criterion.
