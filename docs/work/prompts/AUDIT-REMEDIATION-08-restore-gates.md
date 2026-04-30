# 08 — Restore the gates: CODEOWNERS, branch protection, commitlint

**Closes:** FIND-024, FIND-025, FIND-026 (MAJOR).
**Branch:** `audit-remediation/08-restore-gates`.
**Spec:** §17.4, §17.5.

## Why

- `CODEOWNERS` covers ~20 % of code surfaces.
- No declarative branch-protection config in repo.
- Conventional Commits compliance is 37 % despite a `commit-msg` hook.

## What to do

### CODEOWNERS

Replace `.github/CODEOWNERS` with full coverage:

```
# Platform packages — 2 reviewers including a platform architect
/packages/*       @platform-architects @platform-team
/packages-web/*   @platform-architects @platform-frontend
/tools/*          @platform-architects
/infra/*          @platform-architects @sre

# Apps — 1 reviewer
/apps/*           @app-owners

# Cross-cutting
/.github/         @platform-architects
/specs/           @platform-architects
/docs/            @platform-architects @docs-team

# Tests
/test/            @platform-team

# Top-level
/package.json     @platform-architects
/pnpm-workspace.yaml @platform-architects
/turbo.json       @platform-architects
```

Adjust team handles to match the org. Verify with the GitHub UI that no
file is unowned.

### Branch protection

Use a declarative approach. Pick one:

- (A) `repository-settings`-action workflow (`.github/workflows/repo-settings.yml`).
- (B) Terraform `github_branch_protection` resource under `infra/github/`.

Required status checks: `lint`, `typecheck`, `unit-tests`, `migration-lint`,
`doctor`, `lint:cycles`. Linear history. Dismiss stale reviews on push.
2 approvals for `packages/*` and `packages-web/*` paths (via CODEOWNERS).

### Commitlint

1. Tighten `commitlint.config.*` — set `subject-case`, `type-enum`
   strict, `header-max-length` 100.
2. Add a PR-title commitlint check (`amannn/action-semantic-pull-request`).
3. Backfill: amend the most recent N non-conforming commits if doing
   a rebase is acceptable; otherwise document the cut-over date and
   hold new commits to the bar.
4. Document `--no-verify` policy in `CONTRIBUTING.md`: forbidden
   except for hotfixes with explicit ADR.

## Acceptance

- `gh api repos/:owner/:repo/codeowners/errors` returns no errors.
- Branch protection config is in the repo (path A or B), not just
  configured via UI.
- `pnpm exec commitlint --from origin/main --to HEAD` exits 0 for
  the next 50 PR commits.
- A bad commit message (`echo "bad" | pnpm exec commitlint`) exits non-zero.

## Verify

```
gh api repos/:owner/:repo/codeowners/errors
git log --pretty=format:'%s' -50 | pnpm exec commitlint
```
