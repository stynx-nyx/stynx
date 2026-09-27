# GitHub Repository Settings

Terraform in this directory declares the `main` branch-protection policy for
`stynx-nyx/stynx`. It is the declared source of truth for that rule set; the
live rule set is what GitHub enforces. Reconcile whenever either side changes.

## Verify (no writes)

No Terraform state is committed, so import the live rule first, then plan.
A zero-change plan proves the declaration matches what GitHub enforces:

```bash
export GITHUB_TOKEN=<token with repository administration>
terraform init
terraform import github_branch_protection.main stynx:main
terraform plan   # expect "No changes."
```

Without Terraform installed, the same comparison can be made by hand:

```bash
gh api repos/stynx-nyx/stynx/branches/main/protection \
  --jq '{enforce_admins: .enforce_admins.enabled,
         contexts: .required_status_checks.contexts,
         reviews: .required_pull_request_reviews
           | {required_approving_review_count, require_code_owner_reviews}}'
```

## Apply

Only after a reviewed change to this directory, and only by the Owner:

```bash
terraform apply
```

## Maintenance rules

- `required_status_checks.contexts` must list exactly the job names GitHub is
  asked to require. They come from `.github/workflows/ci.yml`,
  `semantic-pr-title.yml` and `release-prep.yml`, plus the `verified-local-rc`
  check-run posted by `devai-local-rc-verify.yml`. Renaming a job in a
  workflow requires the same rename here, or the branch becomes unmergeable
  (a required context that never reports).
- Keep `.github/branch-protection.yml` identical in meaning;
  `node scripts/verify-branch-protection.mjs` compares it with the live rule.
- Changing `enforce_admins` or `required_approving_review_count` weakens or
  strengthens a fail-closed gate and is an Owner decision.
- Last reconciliation: 2026-09-27. `verified-local-rc` replaced `unit-tests`,
  `integration-tests`, `stynx-tier-gate`, `build (ubuntu-latest)` and
  `reference-web-e2e` (ADR-DEVAI-ADOPTION-0006). The Owner made the no-approval,
  no-code-owner-review posture definitive (ADR-BRANCH-PROTECTION-0001).
  `enforce_admins=false` is unchanged.
