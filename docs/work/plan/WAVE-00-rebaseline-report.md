# Wave 00 Rebaseline Report

**Date:** 2026-05-17
**Role:** Auditor
**Scope:** non-destructive rebaseline plus one contained Wave 1 workflow-lint fix.

## Repo State

`git status --short --branch` after the first execution pass:

```text
## main...origin/main [ahead 6]
 M .github/workflows/devai-gates.yml
?? .devai/state/agent-runs/AR-019e3849-8f5b-79b3-a097-6dd8d9d0482d.json
?? .devai/state/skills/SKILL-compute-scorecard/2026-05-17T23-33-25-466Z.json
```

Notes:

- The `docs/work/plan/*` prompt/report files are ignored by `.gitignore`; they
  are intentionally scratch artifacts unless a human asks to force-add them.
- The `.devai/state/**` files are generated state and were not mixed into the
  workflow-lint fix.

## Command Evidence

| Command | Result | Notes |
| --- | ---: | --- |
| `node -v` | pass | `v24.15.0`; T-06 is stale for this machine. |
| `pnpm -v` | pass | `9.15.0`. |
| `pnpm check:engines` | pass | `[engines][ok] node 24.15.0; pnpm >=9 <10`. |
| `pnpm lint:migrations` | pass | `clean (17 files)`; T-01 parser failure is stale locally. |
| `pnpm --filter migration-linter test` | pass | 22 tests pass, including repo migrations lint without parser errors. |
| `pnpm lint:cycles` | pass | 471 files processed, no circular dependency. |
| `pnpm doctor` | pass but weak | Invokes pnpm's own builtin command and exits 0 with no output. Do not use it as the STYNX repo doctor. |
| `pnpm run doctor` | pass | Runs repo doctor and emits JSON with 6 checks passing. |
| `pnpm lint:deps` | pass | No depcheck issue. |
| `pnpm lint:workflows` | fail, then pass | Initially failed on shell quoting in `.github/workflows/devai-gates.yml`; Wave 1 patch quotes `$HOME`, `PNPM_HOME`, and `$GITHUB_PATH`; command now passes. |
| `pnpm --filter @stynx/audit test` | pass | 2 suites / 3 tests. A-01 still needs hash-chain-specific inspection before closure. |
| `pnpm --filter @stynx/privacy test` | pass | 2 suites / 7 tests. A-02 still needs live/archive/audit LGPD fixture depth. |
| `pnpm --filter @stynx/flow test` | pass | 3 suites / 14 tests. Flow package baseline remains green. |
| `pnpm --filter @stynx-web/angular-flow test` | pass | 3 suites / 12 tests. Angular Flow baseline remains green. |
| `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int` | pass | 3 suites / 12 tests. |
| `git diff --check` | pass | No whitespace errors after workflow patch. |

## Live Gap Routing

| Gap family | Rebaseline status | Next wave |
| --- | --- | --- |
| D-01 FK integrity | open; not retested in Wave 0 | Wave 04 |
| D-02 reference migration tooling | likely stale/needs doc update; platform migrations and CLI exist, but reference-app framing still needs verification | Wave 04 |
| D-03 work item API ownership | open until reference APIs are inspected and decided | Wave 04 |
| D-04 DB structure verification | partially closed by `db:verify` and data integration evidence; CI/reference gate status still needs durable check | Wave 01 / Wave 04 |
| R-01..R-05 RBAC/tenancy/PII/auth | open or under-authored from current docs | Wave 04 |
| F-01/F-02 | closed | no wave |
| F-03 frontend test counts | open for most web packages; current counts show only `angular-flow` has 3 tests, others have 1 | Wave 08 or package-specific follow-up |
| F-04 Bootstrap advisory | stale locally; no `"bootstrap"` dependency found in package manifests/lockfile scan | Wave 03 doc update |
| P-01 `@stynx/contracts` missing | stale; `packages/contracts/package.json` exists as `@stynx/contracts` | Wave 02 doc update/consumer verification |
| P-02 `@stynx-web/angular-tenancy` missing | stale; `packages-web/angular-tenancy/package.json` exists | Wave 02 doc update/consumer verification |
| P-03 privacy direct S3 import | stale by grep; `@aws-sdk/client-s3` appears only under `packages/storage` and storage tests | Wave 02 or Wave 05 doc update |
| P-04 legacy `@stech/*` / workspace globs | partially stale; `packages/stynx-contracts` absent, but `pnpm-workspace.yaml` still includes `test/*` | Wave 03 |
| P-05 legacy reference frontend | stale; `apps/reference-frontend` absent | Wave 03 doc update |
| P-06 auth/idempotency layering | not rechecked | Wave 02 |
| T-01 migration linter | stale locally; linter/test green | Wave 01 doc/CI verification |
| T-02 pg import guard | not rechecked | Wave 01 |
| T-03 boundaries activity | not rechecked | Wave 01 |
| T-04 cycles CI wiring | likely closed; `ci.yml` references `lint:cycles` and command passes | Wave 01 doc update |
| T-05 doctor silent | closed by command correction; `pnpm run doctor` is the useful repository doctor and CI uses it | Wave 01 |
| T-06 node engine mismatch | stale locally; engine check passes with Node 24 | Wave 01 doc update |
| O-01..O-07 ops/infra | open except not revalidated in detail | Waves 06-07 |
| A-01 audit hash chain | open/verify-before-close; audit tests pass but are still shallow | Wave 05 |
| A-02 LGPD pipeline depth | open; privacy tests pass but fixture depth remains the issue | Wave 05 |
| A-03 curated DML audit | closed for current baseline; future enforcement remains process/gate work | Wave 05 |
| Doc-01..Doc-06 | open or partially open | Wave 08 |
| G-01 CODEOWNERS | appears much broader than old finding; needs coverage check before closure | Wave 01 |
| G-02 branch protection | not rechecked | Wave 01 |
| G-03 commit discipline | not rechecked | Wave 01 |
| DV-01..DV-04 | moved upstream to `../devai` | Wave 10 |
| Q-01 RBAC Matrix role | open | Wave 02 |
| PF-01..PF-03, PF-07..PF-09, PF-11 | closed | no wave |
| PF-04, PF-05, PF-06, PF-10, PF-12 | open/deferred follow-up | Wave 09 |

## Wave 1 Started

The first contained Wave 1 fix was applied:

```diff
-          mkdir -p $HOME/.local/bin
+          mkdir -p "$HOME/.local/bin"
           cd packages/cli
-          PNPM_HOME=$HOME/.local/bin pnpm link --global
-          echo "$HOME/.local/bin" >> $GITHUB_PATH
+          PNPM_HOME="$HOME/.local/bin" pnpm link --global
+          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
```

Evidence after patch:

```text
pnpm lint:workflows
# pass
```

## Next Recommended Execution

Continue Wave 1 with:

1. keep `pnpm run doctor` as the canonical command everywhere;
2. verify/add the `pg` import guard;
3. verify/add a boundaries activity test;
4. compute CODEOWNERS coverage and branch-protection config status;
5. update `docs/KNOWN_GAPS.md` only after those checks are complete.
