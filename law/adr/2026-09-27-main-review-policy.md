---
adr_id: ADR-BRANCH-PROTECTION-0001
title: main requires no approving review and no code-owner review
status: accepted
date: 2026-09-27
authors: ['Architect']
tags: [stynx, governance, branch-protection]
---

# ADR-BRANCH-PROTECTION-0001 — main requires no approving review and no code-owner review

**Status:** Accepted.
**Authority:** Owner decision, stated as peremptory and definitive on
2026-09-27, confirming the 2026-09-12 decision recorded in `infra/github/main.tf`.

## Context

`main` already enforced zero required approvals and no code-owner review on
GitHub, and `infra/github/main.tf` had recorded that posture since 2026-09-12.
`.github/branch-protection.yml`, the file `scripts/verify-branch-protection.mjs`
compares against the live rule, still declared one approval with code-owner
review. That produced a standing drift report.

## Decision

The `main` pull-request review policy is:

- `required_approving_review_count: 0`
- `require_code_owner_reviews: false`
- `dismiss_stale_reviews: true` (unchanged)

The repository is maintained by one person, and GitHub never counts a pull
request author's own approval, so a required review could only be satisfied
through an administrator bypass. Merges still go through a pull request with
every required status check, strict and up to date, including
`verified-local-rc` (ADR-DEVAI-ADOPTION-0006). `enforce_admins` stays `false`.
`.github/CODEOWNERS` stays as routing metadata for review requests; it is no
longer a merge gate.

`.github/branch-protection.yml` and `infra/github/main.tf` both declare this
policy and the current required status checks.

## Consequences

- `node scripts/verify-branch-protection.mjs` reports no drift.
- Reintroducing required reviews is a new Owner decision that amends this ADR.
