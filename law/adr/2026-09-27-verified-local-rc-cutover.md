---
adr_id: ADR-DEVAI-ADOPTION-0006
title: Gate pull requests on verified-local-rc instead of remote product tiers
status: accepted
date: 2026-09-27
authors: ['Architect']
tags: [stynx, devai, ci-economy, governance]
---

# ADR-DEVAI-ADOPTION-0006 — Gate pull requests on verified-local-rc instead of remote product tiers

**Status:** Accepted.
**Authority:** Owner decision of 2026-09-26 that `verified-local-rc` replace the
heavy remote pull-request jobs, executed on 2026-09-27 under the Owner's
explicit mandate to perform the required changes.
**Amends:** `ADR-DEVAI-ADOPTION-0004` (cutover deferral) and
`2026-08-24-ci-economy.md` (pull-request gate composition).

## Context

`ADR-DEVAI-ADOPTION-0004` wired the trusted local RC ledger gate. It deferred
the cutover until the first green `verified-local-rc`. That happened on
2026-09-27: the RC closure passed 15/15 on candidate `ad4c8fdf` (PR #279), its
signed bundle was published as `devai-local-evidence/6e03be9f…`, and
verification passed both on the pull-request head (exact-commit) and on `main`
`a2f394bb` (exact-tree).

The RC closure already executes everything the heavy remote pull-request jobs
ran:

| Remote job              | RC closure node                                       |
| ----------------------- | ----------------------------------------------------- |
| `unit-tests`            | `test:unit`, `release:prepare` (per-package coverage) |
| `integration-tests`     | `test:integration`                                    |
| `stynx-tier-gate`       | `test:unit`, `test:integration`, `db:rls`             |
| `build (ubuntu-latest)` | `build`                                               |
| `reference-web-e2e`     | `reference:apps`, `test:e2e`                          |

It also runs `api:contracts`, `docs`, `test:performance`, `security`, and
`doctor`, and it enforces the per-package coverage gates that remote CI never
ran. Running the same work again remotely took about 36 minutes of serial
critical path per pull request.

## Decision

1. The required status checks on `main` are `semantic-pr-title`, `install`,
   `lint`, `typecheck`, `migration-lint`, `verified-local-rc`,
   `package-policy`, and `dependency-audit`. Strict up-to-date checks stay on.
2. `ci.yml` keeps only the cheap static lane: `install`, `lint`, `typecheck`,
   `lint:cycles`, `migration-lint`, and `doctor`, with `doctor` now after
   `typecheck`. The `unit-tests`, `integration-tests`, `stynx-tier-gate`, and
   `build` jobs are removed.
3. `reference-apps.yml` stays as a path-filtered, non-required signal. Its
   `reference-apps-not-applicable.yml` companion existed only to satisfy the
   required `reference-web-e2e` check, so it is retired together with its
   `scripts/lint-workflows.mjs` pairing.
4. `audit.yml` keeps the weekly, quiescence-guarded remote run of the complete
   matrix (`2026-08-24-ci-economy.md` Decision 4) as independent recalibration
   of the trusted local evidence.
5. Every pull-request head that should merge carries a `verified-local-rc`
   check. The admitted signer produces it with `pnpm devai:rc:prepare` and
   `pnpm devai:rc:publish`. The admins' bypass posture on `main` is unchanged.

## Consequences

- The pull-request critical path drops from about 36 minutes to about 6.
- Merge readiness now depends on a signed local run by the admitted signer.
  The attestation proves signer identity and byte integrity; GitHub does not
  re-execute the product tiers. `audit.yml` bounds how long a divergence
  between local and remote execution can go unnoticed.
- A rebase-merge of an up-to-date pull request keeps its tree, so the
  push-triggered exact-tree verification on `main` reuses the pull request's
  evidence tag.
