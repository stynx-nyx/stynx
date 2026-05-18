# Wave 01 Trustworthy Gates Report

**Date:** 2026-05-17
**Role:** Engineer + Inspector
**Scope:** T-01..T-06, G-01..G-03, D-04 gate evidence.

## Changes Made

- Quoted `$HOME`, `PNPM_HOME`, and `$GITHUB_PATH` in
  `.github/workflows/devai-gates.yml`; this fixed `github-actionlint`
  shellcheck warnings.
- Replaced the conventional-only PR title action with a PR title workflow that
  pipes the title into `commitlint` using
  `tools/repo-config/commitlint.config.cjs`, so DEVAI role-prefix titles and
  Conventional Commit titles share one parser.
- Added `.github/branch-protection.yml` as the repository-owned main-branch
  protection baseline.
- Added `@stynx-internal/eslint-config` tests proving:
  - raw PostgreSQL imports fail outside `@stynx/data` and `@stynx/cli`;
  - raw PostgreSQL imports remain allowed in those two packages;
  - the shared config activates `eslint-plugin-boundaries` and the internal
    workspace dependency rule.
- Updated `CONTRIBUTING.md` to document both accepted subject shapes.
- Updated `docs/KNOWN_GAPS.md` to mark Wave 1 stale/closed findings with current
  evidence.

## Verification Evidence

| Command | Result | Notes |
| --- | ---: | --- |
| `pnpm check:engines` | pass | Node `24.15.0`, pnpm `9.15.0`. |
| `pnpm lint:migrations` | pass | `clean (17 files)`. |
| `pnpm --filter migration-linter test` | pass | 22 tests. |
| `pnpm lint:cycles` | pass | 472 files processed; no cycles. |
| `pnpm --filter @stynx-internal/eslint-config test` | pass | 3 tests for pg restriction and boundaries activation. |
| `node tools/repo-config/commitlint.test.cjs` | pass | 20 parser cases. |
| `printf '%s\n' 'Engineer: close migration gate' \| pnpm exec commitlint --config tools/repo-config/commitlint.config.cjs` | pass | DEVAI role-prefix title accepted. |
| `printf '%s\n' 'fix(repo): close migration gate' \| pnpm exec commitlint --config tools/repo-config/commitlint.config.cjs` | pass | Conventional title accepted. |
| `printf '%s\n' 'bad title without colon' \| pnpm exec commitlint --config tools/repo-config/commitlint.config.cjs` | fail as expected | Invalid title rejected. |
| `pnpm lint:workflows` | pass | GitHub workflow syntax/actionlint clean. |
| `pnpm run doctor` | pass | Emits structured JSON with 6 checks passing. |
| `git diff --check` | pass | No whitespace errors. |

## Closed Rows

- T-01 migration linter regression: stale, now green and CI-wired.
- T-02 raw PostgreSQL import guard: closed with eslint-config test evidence.
- T-03 boundaries activity proof: closed with eslint-config test evidence.
- T-04 cycle check CI wiring: closed.
- T-05 doctor command output: closed by command correction; `pnpm run doctor` is
  canonical for repo doctor, while `pnpm doctor` is pnpm's builtin.
- T-06 Node engine mismatch: stale, engine check and CI use Node 24.
- G-01 CODEOWNERS: stale, current `.github/CODEOWNERS` covers active roots and
  has a catch-all.
- G-02 branch protection: closed by `.github/branch-protection.yml`.
- G-03 commit/PR title enforcement: closed for future work by commitlint config,
  parser tests, and PR title workflow.

## Remaining Route

Continue with Wave 02 after deciding whether the stale package-topology rows
should be closed by documentation only or followed by consumer/import
verification. The current rebaseline already found `@stynx/contracts` and
`@stynx-web/angular-tenancy` present.
