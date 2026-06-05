---
title: 'Release Readiness'
---

# v1.0 Release Readiness

Prompt 37 release readiness is **closed** as of 2026-04-27 under the revised
no-cloud-secret artifact scope. AWS/ECR push and Cosign signing are no longer
Prompt 37 gates; reference app image scans and SBOM generation are owned by the
reference-app workflow instead of the STYNX package release lane.

## Implemented release-prep surfaces

- Major `1.0.0` changeset stubs for every publishable workspace package under `.changeset/`.
- Root `MIT` license plus per-package `LICENSE` files for every publishable package.
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

- `@stynx/flow`: backend package build/test coverage, platform migrations `0015_flow_gap_closure.sql` and `0016_platform_curated_audit.sql`, answer/waiver mutation signal freshness, curated-table DML audit coverage, reference API import via `StynxFlowModule`, and release changeset `.changeset/flow-gap-closure.md`.
- `@stynx-web/angular-flow`: Angular package tests with `passWithNoTests` removed, API facade coverage for the Flow contract, typed fill execution controls, reference web route mount under `/flow`, route-access E2E seed, and release changeset `.changeset/flow-gap-closure.md`.
- Flow deprecation-readiness evidence: reference API HTTP-pipeline coverage for Flow guards, request context, idempotency replay, audit writes, form answer/waiver execution, signal freshness, task assignment/action, and analytics smoke; reference-web generic route E2E coverage for forms, fills, assignments, waivers, open tasks, and run summary; and the consuming-repo cutover plan in [porm-flow-deprecation-readiness.md](./porm-flow-deprecation-readiness).

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

The release workflow still owns package versioning through Changesets. Registry
publishing is intentionally opt-in because the current package scopes (`@stynx`,
`@stynx-web`, and `@stech`) cannot be published with this repository's default
`GITHUB_TOKEN`. Set `STYNX_ENABLE_REGISTRY_PUBLISH=true` and provide an
appropriate `NPM_TOKEN` only after package namespace ownership is configured.

The spec’s public post-release label is still intentionally not applied by this
readiness closure:

- `README.md` is **not** changed to `STYNX v1.0 - Shipped`.
