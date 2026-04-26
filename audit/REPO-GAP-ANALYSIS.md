# STYNX Repository Gap Analysis

Date: 2026-04-23
Baseline branch at inspection: `main`
Prompt target: Prompt 0 only (`./audit/REPO-GAP-ANALYSIS.md`, no source edits)

## Baseline Notes

- The worktree was already dirty before this audit. I treated the checked-out tree as the audit baseline and confined new filesystem writes to `./audit/` only.
- The prompt-sequence convention says each prompt should run on a feature branch. That could not be satisfied in this checkout because Git ref creation is blocked locally: `git switch -c stynx/00-repo-audit` failed with `Operation not permitted` when writing `.git/refs/heads/...`.
- Authoritative spec inputs present under `./specs/` and read for this audit:
  - `STYNX-SPEC-v0.6.md`
  - `STYNX-ADR-001-soft-delete.md`
  - `STYNX-ADR-002-perms-caching.md`
  - `STYNX-API-DATA.md`
  - `STYNX-REFERENCE-MIGRATION.sql`
  - `STYNX-ADOPT-EXAMPLE.md`
  - `STYNX-CDK-SKELETON.md`
  - `STYNX-CODEX-PROMPTS.md` (supporting, not normative)
- Inventory method:
  - Line-item inventory below covers Git-tracked plus untracked non-ignored first-party files.
  - Ignored dependency/vendor trees under `node_modules/**` are excluded from line-item listing because they are local install state, not repository intent.
  - Generated trees present on disk but collapsed by glob for readability: `apps/reference-backend/dist/**`, `apps/reference-frontend/dist/**`, `packages/*/dist/**`, `frontend/.angular/cache/**`.
## 1. Inventory
### 1.1 Topology Summary

| Surface | Observed state | Category | Notes |
|---|---|---|---|
| Root package manager | npm workspaces + `package-lock.json` | divergent | SPEC requires pnpm 9 + Turborepo + Changesets |
| Package scope | `@stech/*` | divergent | SPEC requires `@stynx/*` and `@stynx-web/*` |
| Backend package topology | 8 packages, heavily collapsed | partial | Useful extracted code exists, but the package slicing is far from the target 16-package backend family |
| Frontend package topology | 2 packages | divergent | SPEC requires a dedicated `packages-web/*` family |
| Legacy scaffold | `backend/`, `frontend/`, `bootstrap/` still active | divergent | The repo still has competing architectural centers instead of a single package-first topology |
| DB layer | hand-written SQL + raw `pg` service | divergent | SPEC requires Drizzle + `@stynx/data` + three-role tx helper + archive model |
| Soft delete | live-table flag in `storage.files`, no archive model | divergent | Conflicts directly with ADR-001 and SPEC §14 |
| Audit | custom `audit.events` + trigger function | partial | There is useful audit logic, but the schema/retention/archive semantics are not v1-complete |
| Sessions/authz cache | absent as STYNX v1 design | missing | No STYNX bearer/session family or ADR-002 implementation |
| Tooling / CI / release | mostly absent for v1 | divergent | No pnpm workspace, turbo, changesets, workflows, CODEOWNERS gate |

### 1.2 Strict Classification Policy

The file inventory below is the authoritative classification surface. Directory rollups are derived from file classifications and never override them.

Precedence rules used for every file:

1. `obsolete`: generated output, caches, placeholders, or historical artifacts that are not part of the intended source tree.
2. `conformant`: authoritative v1 inputs or Prompt 0 artifacts already in the correct place and serving the correct role.
3. `partial`: materially reusable toward the v1 target, but incomplete, mis-scoped, or still tied to the transitional architecture.
4. `divergent`: implements overlapping concerns using the wrong topology, wrong contract, or wrong architectural choice for v1.
5. `missing`: used only for absent spec-required artifacts and directories; not for files present on disk.

Decision standard for `partial` vs `divergent`:

- `partial` means the file plausibly survives via extraction, rename, or bounded refactor without changing the underlying feature intent.
- `divergent` means the file is anchored to a model the spec rejects or bypasses, so keeping it as the implementation baseline would create rework or invariant drift.

### 1.3 Directory Rollups (Derived, Not Authoritative)

| Directory | Category | Derivation |
|---|---|---|
| `.codex` | divergent | derived from 8 file classifications: {'divergent': 8} |
| `apps` | partial | derived from 21 file classifications: {'partial': 21} |
| `apps/reference-backend` | partial | derived from 4 file classifications: {'partial': 4} |
| `apps/reference-frontend` | partial | derived from 17 file classifications: {'partial': 17} |
| `audit` | partial | derived from 1 file classifications: {'partial': 1} |
| `backend` | divergent | derived from 51 file classifications: {'divergent': 28, 'partial': 23} |
| `bootstrap` | divergent | derived from 16 file classifications: {'divergent': 16} |
| `db` | divergent | derived from 5 file classifications: {'partial': 1, 'divergent': 4} |
| `db/ddl` | divergent | derived from 4 file classifications: {'partial': 1, 'divergent': 3} |
| `db/seed` | divergent | derived from 1 file classifications: {'divergent': 1} |
| `docs` | divergent | derived from 34 file classifications: {'partial': 19, 'divergent': 12, 'obsolete': 3} |
| `docs/api` | partial | derived from 2 file classifications: {'partial': 2} |
| `docs/dev` | divergent | derived from 4 file classifications: {'divergent': 4} |
| `docs/governance` | divergent | derived from 7 file classifications: {'divergent': 7} |
| `docs/stynx` | partial | derived from 16 file classifications: {'partial': 16} |
| `docs/sys` | partial | derived from 1 file classifications: {'partial': 1} |
| `docs/user` | divergent | derived from 1 file classifications: {'divergent': 1} |
| `docs/work` | obsolete | derived from 3 file classifications: {'obsolete': 3} |
| `frontend` | divergent | derived from 67 file classifications: {'divergent': 52, 'partial': 15} |
| `packages` | divergent | derived from 90 file classifications: {'partial': 76, 'divergent': 14} |
| `patches` | obsolete | derived from 15 file classifications: {'obsolete': 15} |
| `scripts` | divergent | derived from 10 file classifications: {'divergent': 10} |
| `specs` | partial | derived from 8 file classifications: {'conformant': 7, 'partial': 1} |
| `src` | obsolete | derived from 1 file classifications: {'obsolete': 1} |
| `test` | divergent | derived from 48 file classifications: {'obsolete': 1, 'divergent': 24, 'partial': 23} |
| `test/backend` | divergent | derived from 7 file classifications: {'divergent': 7} |
| `test/db` | partial | derived from 7 file classifications: {'partial': 7} |
| `test/frontend` | divergent | derived from 9 file classifications: {'divergent': 9} |
| `test/packages` | divergent | derived from 22 file classifications: {'partial': 16, 'divergent': 6} |
| `test/scripts` | divergent | derived from 2 file classifications: {'divergent': 2} |
| `tests` | missing | no classified first-party files currently present under this directory |

### 1.4 File Classification Totals

| Category | Count |
|---|---:|
| `conformant` | 7 |
| `partial` | 181 |
| `divergent` | 177 |
| `obsolete` | 21 |
| `total` | 386 |

### 1.5 Frontend Classification Tightening

The previous pass still treated too many frontend files as generically reusable. This stricter pass classifies frontend files by whether their underlying behavior survives the v1 web-package architecture.

- `divergent`: any file whose core behavior depends on the legacy Angular app shell, implicit Cognito Hosted UI token flow, `localStorage` token persistence, role-only client authorization, or app-specific admin routes and DTOs.
- `partial`: files whose underlying interaction model survives extraction into `packages-web/*`, such as generic header injection, locale switching, confirmation dialogs, and upload/list UX flows.
- App bootstrap files (`app.*`, `main.ts`, routes, environment files, shell layout) stay `divergent` even when technically portable, because the spec replaces them with reusable packages plus `apps/reference-web`.
- Evidence used for this stricter rule: `frontend/src/app/core/auth/cognito-auth.service.ts` uses `response_type=token` and `localStorage`; `frontend/src/app/core/guards/role.guard.ts` is role-gated rather than permission-gated; `frontend/src/app/storage/storage-explorer.component.ts` shows reusable upload/list flow ideas but is coupled to legacy `/storage/files` endpoints.

### 1.6 File-by-File Inventory

Every non-ignored first-party file presently in the repo is classified below with one decisive reason.

#### (root)

| Path | Category | Decisive reason |
|---|---|---|
| `.gitignore` | partial | repo hygiene file is necessary and can be retained, but it will need pnpm/turbo/build-output updates |
| `AGENTS.md` | divergent | repo-local agent instructions are operational metadata, not part of the product topology |
| `GOVERNANCE.md` | divergent | transitional repo-note artifact documents current migration state rather than a v1 deliverable |
| `package-lock.json` | divergent | root workspace metadata is npm-based and conflicts with the pnpm/turbo/changesets target |
| `package.json` | divergent | root workspace metadata is npm-based and conflicts with the pnpm/turbo/changesets target |
| `PROMPT_UPDATE_FRONTEND_ENV_WITH_PATCHES.md` | obsolete | historical prompt artifact rather than source-of-truth implementation or spec |
| `README.md` | divergent | top-level documentation describes the transitional npm/@stech workspace rather than the v1 topology |
| `SUMMARY.md` | divergent | transitional repo-note artifact documents current migration state rather than a v1 deliverable |
| `TODO.md` | divergent | transitional repo-note artifact documents current migration state rather than a v1 deliverable |
| `tsconfig.base.json` | divergent | root TypeScript scaffolding is transitional and not the target tools/tsconfig package setup |
| `tsconfig.json` | divergent | root TypeScript scaffolding is transitional and not the target tools/tsconfig package setup |

#### .codex

| Path | Category | Decisive reason |
|---|---|---|
| `.codex/prompts/governance-structure-audit.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/prompts/npm-security-upgrade.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/prompts/repo-governance-align.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/README.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/skills/governance-structure-auditor/SKILL.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/skills/npm-security-upgrade-auditor/SKILL.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/skills/repo-governance-aligner/SKILL.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |
| `.codex/system.md` | divergent | repo-local Codex prompts and skills are operational aids, not part of the product topology defined by the spec |

#### apps

| Path | Category | Decisive reason |
|---|---|---|
| `apps/reference-backend/package.json` | partial | reference Nest consumer stub exists and demonstrates package composition, but it is far smaller than the spec `reference-api` |
| `apps/reference-backend/README.md` | partial | reference Nest consumer stub exists and demonstrates package composition, but it is far smaller than the spec `reference-api` |
| `apps/reference-backend/src/app.module.ts` | partial | reference Nest consumer stub exists and demonstrates package composition, but it is far smaller than the spec `reference-api` |
| `apps/reference-backend/tsconfig.json` | partial | reference Nest consumer stub exists and demonstrates package composition, but it is far smaller than the spec `reference-api` |
| `apps/reference-frontend/package.json` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/README.md` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/scripts/build-web.mjs` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/app.component.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/app.routes.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/core/auth.guard.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/core/reference-api.service.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/core/reference-auth.facade.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/pages/dashboard.page.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/pages/login.page.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/app/reference-frontend.module.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/environments/environment.prod.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/environments/environment.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/main.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/web/index.html` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/src/web/main.ts` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |
| `apps/reference-frontend/tsconfig.json` | partial | reference Angular consumer stub exists, but it is far smaller than the spec `reference-web` |

#### audit

| Path | Category | Decisive reason |
|---|---|---|
| `audit/REPO-GAP-ANALYSIS.md` | partial | Prompt 0 audit artifact in the required path; not product code, but correct for the current prompt |

#### backend

| Path | Category | Decisive reason |
|---|---|---|
| `backend/.env.example` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |
| `backend/eslint.config.mjs` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |
| `backend/nest-cli.json` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |
| `backend/package-lock.json` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |
| `backend/package.json` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |
| `backend/src/app.module.ts` | divergent | legacy application bootstrap/config surface is not the target shared-package architecture |
| `backend/src/config/configuration.ts` | divergent | legacy application bootstrap/config surface is not the target shared-package architecture |
| `backend/src/core/audit/audit.interceptor.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/audit/audit.module.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/audit/audit.service.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/audit/decorators/audit.decorator.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/auth/auth.controller.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/auth/auth.module.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/auth/auth.service.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/auth/biometric.service.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/auth/cognito-sync.service.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/auth/decorators/current-user.decorator.ts` | partial | legacy auth guard/decorator primitives contain reusable ideas, but they are not yet the final v1 auth/session model |
| `backend/src/core/auth/decorators/roles.decorator.ts` | partial | legacy auth guard/decorator primitives contain reusable ideas, but they are not yet the final v1 auth/session model |
| `backend/src/core/auth/digital-signing.service.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/auth/guards/jwt-auth.guard.ts` | partial | legacy auth guard/decorator primitives contain reusable ideas, but they are not yet the final v1 auth/session model |
| `backend/src/core/auth/guards/role.guard.ts` | partial | legacy auth guard/decorator primitives contain reusable ideas, but they are not yet the final v1 auth/session model |
| `backend/src/core/auth/guards/tenancy.guard.ts` | partial | legacy auth guard/decorator primitives contain reusable ideas, but they are not yet the final v1 auth/session model |
| `backend/src/core/auth/guards/user.guard.ts` | divergent | legacy auth implementation shape diverges materially from the v1 STYNX bearer/session/authz model |
| `backend/src/core/core.module.ts` | divergent | legacy app-wide aggregation module conflicts with the target package-first composition model |
| `backend/src/core/docs/swagger.ts` | partial | real OpenAPI export logic exists and can seed the future codegen flow, but it is anchored to the legacy app surface |
| `backend/src/core/health/health.controller.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/health/health.module.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/logging/access-log.interceptor.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/logging/correlation-id.interceptor.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/logging/logging.module.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/roles/dto/create-role.dto.ts` | divergent | legacy role-management surface does not match the v1 authorization package or reference domain |
| `backend/src/core/roles/roles.controller.ts` | divergent | legacy role-management surface does not match the v1 authorization package or reference domain |
| `backend/src/core/roles/roles.module.ts` | divergent | legacy role-management surface does not match the v1 authorization package or reference domain |
| `backend/src/core/roles/roles.service.ts` | divergent | legacy role-management surface does not match the v1 authorization package or reference domain |
| `backend/src/core/storage/dto/register-file.dto.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/storage/storage.controller.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/storage/storage.module.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/storage/storage.service.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/tenancy/dto/create-tenancy.dto.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/tenancy/tenancy.controller.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/tenancy/tenancy.module.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/tenancy/tenancy.service.ts` | partial | legacy app code contains reusable ideas for the matching v1 concern, but the current app-first placement and contract are not final |
| `backend/src/core/users/users.controller.ts` | divergent | legacy user-admin surface is app-local and not part of the target shared-platform topology |
| `backend/src/core/users/users.module.ts` | divergent | legacy user-admin surface is app-local and not part of the target shared-platform topology |
| `backend/src/core/users/users.service.ts` | divergent | legacy user-admin surface is app-local and not part of the target shared-platform topology |
| `backend/src/main.ts` | divergent | legacy application bootstrap/config surface is not the target shared-package architecture |
| `backend/src/shared/database/database.module.ts` | divergent | raw `pg` database layer conflicts directly with invariant I1 and the future `@stynx/data` contract |
| `backend/src/shared/database/database.service.ts` | divergent | raw `pg` database layer conflicts directly with invariant I1 and the future `@stynx/data` contract |
| `backend/src/shared/database/index.ts` | divergent | raw `pg` database layer conflicts directly with invariant I1 and the future `@stynx/data` contract |
| `backend/tsconfig.build.json` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |
| `backend/tsconfig.json` | divergent | legacy runnable backend surface overlaps with v1 concerns but is not organized according to the target package boundaries |

#### bootstrap

| Path | Category | Decisive reason |
|---|---|---|
| `bootstrap/eslint.config.js` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/index.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/aws.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/backend.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/cloudfront.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/cognito.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/db.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/env.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/frontend.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/s3.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/targets.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/lib/teardown.ts` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/package-lock.json` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/package.json` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/README.md` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |
| `bootstrap/tsconfig.json` | divergent | legacy bootstrap/deploy toolchain conflicts with the target CLI and CDK topology |

#### db

| Path | Category | Decisive reason |
|---|---|---|
| `db/ddl/00-extensions.sql` | partial | useful extension bootstrap seed, but it misses the full v1 extension set and versioned migration ownership model |
| `db/ddl/01-auth.sql` | divergent | mixes legacy `auth.*` and `stynx.*` GUC helpers, mixed `tenant_id`/`tenancy_id` naming, and no three-role/archive model, so it conflicts with I1/I2/I5/I7/I8 |
| `db/ddl/02-audit.sql` | divergent | contains reusable trigger ideas, but the current `audit.events` RLS and retention model conflicts with the spec audit partitioning and archive-move semantics |
| `db/ddl/03-storage.sql` | divergent | uses live-table `deleted_at` soft delete and a legacy storage registry shape, directly conflicting with ADR-001 and invariant I8 |
| `db/seed/00-base.sql` | divergent | seed data targets the legacy auth schema and cannot be treated as v1 seed truth |

#### docs

| Path | Category | Decisive reason |
|---|---|---|
| `docs/api/openapi.json` | partial | real API artifact exists, but it is tied to the legacy backend export flow rather than package build output |
| `docs/api/README.md` | partial | API-doc surface exists, but not yet the final docs-site information architecture |
| `docs/dev/conventions.md` | divergent | legacy developer docs are not the final docs-site structure and document the wrong operational model |
| `docs/dev/frontend.md` | divergent | legacy developer docs are not the final docs-site structure and document the wrong operational model |
| `docs/dev/ops.md` | divergent | legacy developer docs are not the final docs-site structure and document the wrong operational model |
| `docs/dev/README.md` | divergent | legacy developer docs are not the final docs-site structure and document the wrong operational model |
| `docs/governance/audit/npm-security-upgrade-report.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/governance/audit/README.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/governance/audit/structure-conformance.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/governance/compliance/scorecard-2026-02-15.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/governance/compliance/scoring.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/governance/health/build-status.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/governance/health/preflight.md` | divergent | repo-governance artifacts are outside the target product topology and not part of the v1 package/app deliverables |
| `docs/stynx/consumer-adoption-guide.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/do-not-extract.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/extraction-model.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/feature-coverage-status.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/identity-admin-convergence.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/implementation-status.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/package-architecture.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/porting-analysis.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/remaining-work.md` | partial | transition documentation about the current extraction state; useful for planning, but not the final docs-site structure |
| `docs/stynx/working-notes/audit-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/stynx/working-notes/auth-foundation-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/stynx/working-notes/authorization-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/stynx/working-notes/db-context-tenancy-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/stynx/working-notes/migration-compatibility-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/stynx/working-notes/package-architecture-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/stynx/working-notes/storage-agent.md` | partial | transition working notes capture useful extraction evidence, but they are not final public documentation |
| `docs/sys/architecture.md` | partial | architecture documentation exists and can inform the docs-site migration, but it is not the final docs substrate |
| `docs/user/README.md` | divergent | legacy user-doc surface is outside the target docs-site plan |
| `docs/work/diag/.gitkeep` | obsolete | placeholder work directory artifact |
| `docs/work/inv/.gitkeep` | obsolete | placeholder work directory artifact |
| `docs/work/plan/.gitkeep` | obsolete | placeholder work directory artifact |

#### frontend

| Path | Category | Decisive reason |
|---|---|---|
| `frontend/angular.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/eslint.config.mjs` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/package-lock.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/package.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/proxy.conf.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/src/app/admin/roles/admin-roles.component.html` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/roles/admin-roles.component.scss` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/roles/admin-roles.component.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/tenancies/admin-tenancies.component.html` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/tenancies/admin-tenancies.component.scss` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/tenancies/admin-tenancies.component.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/models.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/roles.service.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/tenancy.service.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/user-detail.component.html` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/user-detail.component.scss` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/user-detail.component.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/user-list.component.html` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/user-list.component.scss` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/user-list.component.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/admin/users/users.service.ts` | divergent | legacy admin UI surface is app-specific and not the target package family |
| `frontend/src/app/app.component.html` | divergent | legacy app bootstrap/shell is not the target reusable web package surface |
| `frontend/src/app/app.component.scss` | divergent | legacy app bootstrap/shell is not the target reusable web package surface |
| `frontend/src/app/app.component.ts` | divergent | legacy app bootstrap/shell is not the target reusable web package surface |
| `frontend/src/app/app.config.ts` | divergent | legacy app bootstrap/shell is not the target reusable web package surface |
| `frontend/src/app/app.routes.ts` | divergent | legacy app bootstrap/shell is not the target reusable web package surface |
| `frontend/src/app/core/api/api.service.ts` | partial | generic base-URL HttpClient wrapper idea survives, but the final surface should be replaced by the generated `@stynx-web/sdk` transport |
| `frontend/src/app/core/auth/auth.facade.ts` | divergent | depends on an app-local `/auth/me` profile shape and legacy token lifecycle, so it is not a clean baseline for the spec Angular auth package |
| `frontend/src/app/core/auth/auth.interceptor.ts` | partial | header injection survives conceptually, but the final implementation must move into SDK-backed refresh/replay interceptors |
| `frontend/src/app/core/auth/cognito-auth.service.ts` | divergent | uses implicit Cognito Hosted UI flow and `localStorage` token persistence, which conflicts with the spec PKCE and storage model |
| `frontend/src/app/core/auth/login.component.html` | divergent | login view is coupled to the legacy implicit Cognito redirect flow rather than the spec Angular auth package contract |
| `frontend/src/app/core/auth/login.component.scss` | divergent | login styling is coupled to the legacy implicit Cognito redirect flow rather than the spec Angular auth package contract |
| `frontend/src/app/core/auth/login.component.ts` | divergent | login component is coupled to the legacy implicit Cognito redirect flow rather than the spec Angular auth package contract |
| `frontend/src/app/core/guards/auth.guard.ts` | partial | route-guard control flow is reusable, but it depends on the legacy auth facade instead of the spec session service |
| `frontend/src/app/core/guards/role.guard.ts` | divergent | client-side role gating is the wrong abstraction for the spec, which uses permission-based advisory guards |
| `frontend/src/app/i18n/i18n.service.ts` | partial | browser-locale initialization idea survives, but the final package must layer tenant overrides and runtime catalog aggregation |
| `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.html` | partial | UI primitive contains reusable ideas for `@stynx-web/angular-ui`, but it currently lives inside the legacy app |
| `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.scss` | partial | UI primitive contains reusable ideas for `@stynx-web/angular-ui`, but it currently lives inside the legacy app |
| `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` | partial | UI primitive contains reusable ideas for `@stynx-web/angular-ui`, but it currently lives inside the legacy app |
| `frontend/src/app/shared/components/debug-user-banner/debug-user-banner.component.html` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/debug-user-banner/debug-user-banner.component.scss` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/debug-user-banner/debug-user-banner.component.ts` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/language-switcher/language-switcher.component.html` | partial | UI primitive contains reusable ideas for `@stynx-web/angular-ui`, but it currently lives inside the legacy app |
| `frontend/src/app/shared/components/language-switcher/language-switcher.component.scss` | partial | UI primitive contains reusable ideas for `@stynx-web/angular-ui`, but it currently lives inside the legacy app |
| `frontend/src/app/shared/components/language-switcher/language-switcher.component.ts` | partial | UI primitive contains reusable ideas for `@stynx-web/angular-ui`, but it currently lives inside the legacy app |
| `frontend/src/app/shared/components/logging-switcher/logging-switcher.component.html` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/logging-switcher/logging-switcher.component.scss` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/logging-switcher/logging-switcher.component.ts` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/theme-switcher/theme-switcher.component.html` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/theme-switcher/theme-switcher.component.scss` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/components/theme-switcher/theme-switcher.component.ts` | divergent | legacy app-specific UI utility is not part of the target shared web package surface |
| `frontend/src/app/shared/layout/dashboard.component.html` | divergent | legacy app-shell layout is not the target reusable web package surface |
| `frontend/src/app/shared/layout/dashboard.component.scss` | divergent | legacy app-shell layout is not the target reusable web package surface |
| `frontend/src/app/shared/layout/dashboard.component.ts` | divergent | legacy app-shell layout is not the target reusable web package surface |
| `frontend/src/app/storage/storage-explorer.component.html` | partial | upload/list/delete interaction flow is reusable, but the component is tied to legacy endpoints and response shapes |
| `frontend/src/app/storage/storage-explorer.component.scss` | partial | upload/list/delete interaction flow is reusable, but the component is tied to legacy endpoints and response shapes |
| `frontend/src/app/storage/storage-explorer.component.ts` | partial | upload/list/delete interaction flow is reusable, but the component is tied to legacy `/storage/files` endpoints and response shapes |
| `frontend/src/assets/i18n/en.json` | partial | real locale catalogs exist and can seed package-level i18n content, but they are still app-local |
| `frontend/src/assets/i18n/pt.json` | partial | real locale catalogs exist and can seed package-level i18n content, but they are still app-local |
| `frontend/src/environments/environment.prod.ts` | divergent | legacy app bootstrap/environment surface is not the target reusable web package surface |
| `frontend/src/environments/environment.ts` | divergent | legacy app bootstrap/environment surface is not the target reusable web package surface |
| `frontend/src/index.html` | divergent | legacy app bootstrap/environment surface is not the target reusable web package surface |
| `frontend/src/main.ts` | divergent | legacy app bootstrap/environment surface is not the target reusable web package surface |
| `frontend/src/styles.scss` | divergent | legacy app bootstrap/environment surface is not the target reusable web package surface |
| `frontend/tsconfig.app.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/tsconfig.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |
| `frontend/tsconfig.spec.json` | divergent | legacy Angular app surface overlaps with future web packages but is not organized according to the target topology |

#### packages

| Path | Category | Decisive reason |
|---|---|---|
| `packages/README.md` | partial | useful transition-level package overview, but not the final monorepo documentation contract |
| `packages/stynx-audit-sql/package.json` | partial | adapter logic is reusable, but the final target is the broader `@stynx/audit` package under the correct scope |
| `packages/stynx-audit-sql/src/index.ts` | partial | adapter logic is reusable, but the final target is the broader `@stynx/audit` package under the correct scope |
| `packages/stynx-audit-sql/tsconfig.json` | partial | adapter logic is reusable, but the final target is the broader `@stynx/audit` package under the correct scope |
| `packages/stynx-auth-cognito-admin/package.json` | partial | Cognito admin adapter logic is reusable, but the final target folds this capability into the v1 auth/tenancy surfaces |
| `packages/stynx-auth-cognito-admin/src/index.ts` | partial | Cognito admin adapter logic is reusable, but the final target folds this capability into the v1 auth/tenancy surfaces |
| `packages/stynx-auth-cognito-admin/tsconfig.json` | partial | Cognito admin adapter logic is reusable, but the final target folds this capability into the v1 auth/tenancy surfaces |
| `packages/stynx-auth-cognito/package.json` | partial | Cognito verification logic is reusable, but only as one slice of the final `@stynx/auth` package |
| `packages/stynx-auth-cognito/src/index.ts` | partial | Cognito verification logic is reusable, but only as one slice of the final `@stynx/auth` package |
| `packages/stynx-auth-cognito/tsconfig.json` | partial | Cognito verification logic is reusable, but only as one slice of the final `@stynx/auth` package |
| `packages/stynx-backend/package.json` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `packages/stynx-backend/src/audit/audit.interceptor.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/audit/audit.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/audit/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/audit/decorators.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/audit/redaction-policy.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/auth-context.guard.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/auth.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/claim-first-tenant-entitlement.policy.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/current-principal.decorator.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/default-principal-mapper.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/required-tenant-header.resolver.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/auth/sql-tenant-entitlement.fallback.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/authorization/authorization.guard.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/authorization/authorization.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/authorization/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/authorization/decorators.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/authorization/default-policy-evaluator.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/common/request-context.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/db-context/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/db-context/db-context.interceptor.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/db-context/db-context.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/db-context/pg-session-db-context.applier.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/db-context/request-db-client-lifecycle.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/db-context/tenant-lifecycle.middleware.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/idempotency/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/idempotency/idempotency.interceptor.ts` | partial | interceptor control flow is reusable, but the final package must swap the current store model for Redis plus durable replay semantics |
| `packages/stynx-backend/src/idempotency/idempotency.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/idempotency/pg-idempotency.store.ts` | divergent | SQL-backed reservation and replay storage is the wrong backend model for the spec, which requires Redis coordination plus durable keys |
| `packages/stynx-backend/src/idempotency/types.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/identity-admin/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/identity-admin/identity-admin.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/identity-admin/identity-admin.service.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/identity-admin/integration-facades.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/identity-admin/pg-local-sync.adapter.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/index.ts` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `packages/stynx-backend/src/pipeline/platform-pipeline.module.ts` | divergent | monolithic pipeline composition is not the target v1 package boundary and will need to be split or removed |
| `packages/stynx-backend/src/rate-limit/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/rate-limit/pg-rate-limit.store.ts` | divergent | SQL-backed window accounting is the wrong backend model for the spec, which requires Redis Lua sliding-window enforcement |
| `packages/stynx-backend/src/rate-limit/rate-limit.guard.ts` | partial | guard control flow is reusable, but the final package must target Redis Lua buckets and response-header semantics |
| `packages/stynx-backend/src/rate-limit/rate-limit.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/rate-limit/types.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/sla/constants.ts` | divergent | SLA concern is not part of the v1 package topology and should not remain in the shared foundation as-is |
| `packages/stynx-backend/src/sla/default-sla-category.resolver.ts` | divergent | SLA concern is not part of the v1 package topology and should not remain in the shared foundation as-is |
| `packages/stynx-backend/src/sla/logger-sla-event.sink.ts` | divergent | SLA concern is not part of the v1 package topology and should not remain in the shared foundation as-is |
| `packages/stynx-backend/src/sla/sla-monitor.interceptor.ts` | divergent | SLA concern is not part of the v1 package topology and should not remain in the shared foundation as-is |
| `packages/stynx-backend/src/sla/sla.module.ts` | divergent | SLA concern is not part of the v1 package topology and should not remain in the shared foundation as-is |
| `packages/stynx-backend/src/sla/types.ts` | divergent | SLA concern is not part of the v1 package topology and should not remain in the shared foundation as-is |
| `packages/stynx-backend/src/storage/constants.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/src/storage/storage.module.ts` | partial | transitional reusable implementation exists and can seed the corresponding v1 package split, but the current package boundary is wrong |
| `packages/stynx-backend/tsconfig.json` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `packages/stynx-contracts/package.json` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/audit.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/auth.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/authorization.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/db-context.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/errors.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/identity-admin.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/index.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/storage.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/src/tenancy.ts` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-contracts/tsconfig.json` | partial | shared contracts are a real starting point, but names, scope, and coverage are still below the v1 contract surface |
| `packages/stynx-frontend-client/package.json` | partial | frontend client utilities are reusable, but the spec target is an OpenAPI-generated `@stynx-web/sdk` plus Angular packages |
| `packages/stynx-frontend-client/src/api-client.ts` | partial | generic header injection and fetch transport logic are reusable, but the final SDK must be OpenAPI-generated and refresh-aware |
| `packages/stynx-frontend-client/src/authorization.ts` | partial | frontend client utilities are reusable, but the spec target is an OpenAPI-generated `@stynx-web/sdk` plus Angular packages |
| `packages/stynx-frontend-client/src/cognito.ts` | divergent | defaults to Hosted UI `response_type=token`, which conflicts with the spec PKCE-based Angular auth flow |
| `packages/stynx-frontend-client/src/index.ts` | partial | frontend client utilities are reusable, but the spec target is an OpenAPI-generated `@stynx-web/sdk` plus Angular packages |
| `packages/stynx-frontend-client/src/jwt.ts` | partial | frontend client utilities are reusable, but the spec target is an OpenAPI-generated `@stynx-web/sdk` plus Angular packages |
| `packages/stynx-frontend-client/src/session-manager.ts` | partial | JWT parsing and principal hydration are reusable, but the final session model and refresh lifecycle change materially in v1 |
| `packages/stynx-frontend-client/src/token-store.ts` | divergent | bundles `localStorage` persistence into the token-store surface, which conflicts with the spec memory plus `sessionStorage` model |
| `packages/stynx-frontend-client/tsconfig.json` | partial | frontend client utilities are reusable, but the spec target is an OpenAPI-generated `@stynx-web/sdk` plus Angular packages |
| `packages/stynx-frontend-contracts/package.json` | partial | frontend contracts are reusable, but the final package topology lives under `packages-web/*` |
| `packages/stynx-frontend-contracts/src/auth.ts` | partial | frontend contracts are reusable, but the final package topology lives under `packages-web/*` |
| `packages/stynx-frontend-contracts/src/http.ts` | partial | frontend contracts are reusable, but the final package topology lives under `packages-web/*` |
| `packages/stynx-frontend-contracts/src/index.ts` | partial | frontend contracts are reusable, but the final package topology lives under `packages-web/*` |
| `packages/stynx-frontend-contracts/tsconfig.json` | partial | frontend contracts are reusable, but the final package topology lives under `packages-web/*` |
| `packages/stynx-storage-s3/package.json` | partial | S3 adapter logic is reusable, but the final storage package must own archive-aware registry and policy flows too |
| `packages/stynx-storage-s3/src/index.ts` | partial | S3 adapter logic is reusable, but the final storage package must own archive-aware registry and policy flows too |
| `packages/stynx-storage-s3/tsconfig.json` | partial | S3 adapter logic is reusable, but the final storage package must own archive-aware registry and policy flows too |

#### patches

| Path | Category | Decisive reason |
|---|---|---|
| `patches/0000-cover-letter.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0001-chore-env-add-backend-.env.example-with-all-relevant.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0002-refactor-frontend-split-inline-templates-and-styles-.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0003-refactor-frontend-migrate-ngIf-ngFor-to-Angular-if-f.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0004-refactor-frontend-migrate-dependency-injection-to-in.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0005-feat-admin-integrate-user-management-module-from-por.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0006-docs-update-readme-and-developer-guide-with-moderniz.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0007-Step-1.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0008-chore-lint-migrate-backend-eslint-config-to-flat-con.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0009-chore-lint-address-backend-lint-findings.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0010-chore-lint-rename-eslint-flat-config-to-.mjs-to-sile.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0011-chore-repo-add-workspace-gitignore.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0012-Summary.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0013-No-Patches.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |
| `patches/0014-fix-build-clean-up-storage-controller-types-and-pg-q.patch` | obsolete | historical patch artifacts rather than source-of-truth repository content |

#### scripts

| Path | Category | Decisive reason |
|---|---|---|
| `scripts/backend-deploy.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/check-rls-smoke.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/cloudfront-bootstrap.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/cognito-bootstrap.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/db-reset.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/docs-generate.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/ec2-provision.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/pipeline-stub.yml` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/postgres-setup.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |
| `scripts/s3-bootstrap.sh` | divergent | current shell scripts target legacy deployment/bootstrap flows rather than the spec CLI/governance toolchain |

#### specs

| Path | Category | Decisive reason |
|---|---|---|
| `specs/STYNX-ADOPT-EXAMPLE.md` | conformant | authoritative adoption workflow reference for `stynx adopt` planning |
| `specs/STYNX-ADR-001-soft-delete.md` | conformant | authoritative architecture decision for archive-based soft delete and FK cascade semantics |
| `specs/STYNX-ADR-002-perms-caching.md` | conformant | authoritative architecture decision for the permission-cache design and invalidation paths |
| `specs/STYNX-API-DATA.md` | conformant | authoritative API contract for the future `@stynx/data` package |
| `specs/STYNX-CDK-SKELETON.md` | conformant | authoritative infrastructure skeleton for the future CDK implementation |
| `specs/STYNX-CODEX-PROMPTS.md` | partial | implementation-sequence helper aligned to the spec set, but not itself normative |
| `specs/STYNX-REFERENCE-MIGRATION.sql` | conformant | authoritative reference domain schema for the reference application and migration checks |
| `specs/STYNX-SPEC-v0.6.md` | conformant | normative platform specification; authoritative target for the entire implementation sequence |

#### src

| Path | Category | Decisive reason |
|---|---|---|
| `src/.gitkeep` | obsolete | empty placeholder root source tree with no runtime value |

#### test

| Path | Category | Decisive reason |
|---|---|---|
| `test/.gitkeep` | obsolete | empty placeholder file only |
| `test/backend/jest.config.ts` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/backend/package.json` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/backend/unit/auth.module.spec.ts` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/backend/unit/auth.service.spec.ts` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/backend/unit/database.service.spec.ts` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/backend/unit/storage.service.spec.ts` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/backend/unit/tenancy.service.spec.ts` | divergent | backend tests target the legacy app surface rather than the target package/reference-app topology |
| `test/db/audit.ddl.spec.ts` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/db/auth.ddl.spec.ts` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/db/jest.config.ts` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/db/package-lock.json` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/db/package.json` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/db/storage.ddl.spec.ts` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/db/tsconfig.test.json` | partial | database tests contain useful assertions and migration evidence, but they currently validate a legacy schema contract |
| `test/frontend/admin-users/user-detail.component.spec.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/admin-users/user-list.component.spec.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/cypress.config.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/e2e/smoke.cy.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/jest.config.cjs` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/jest.config.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/setup-jest.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/tsconfig.jest.json` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/frontend/unit/language-switcher.component.spec.ts` | divergent | frontend tests target the legacy app surface rather than the target `packages-web/*` plus `reference-web` topology |
| `test/packages/audit-sql/audit-sql-parity.spec.ts` | partial | package-level audit tests are reusable evidence for extracted behavior, but they target the transitional package family |
| `test/packages/audit/audit-interceptor-redaction.spec.ts` | partial | package-level audit tests are reusable evidence for extracted behavior, but they target the transitional package family |
| `test/packages/auth-cognito-admin/options-and-errors.spec.ts` | partial | package-level auth tests are reusable evidence for extracted behavior, but they target the transitional package family |
| `test/packages/auth/auth-context.guard.spec.ts` | partial | package-level auth tests are reusable evidence for extracted behavior, but they target the transitional package family |
| `test/packages/auth/tenant-entitlement.spec.ts` | partial | package-level auth tests are reusable evidence for extracted behavior, but they target the transitional package family |
| `test/packages/authorization/default-policy-evaluator.spec.ts` | partial | package-level auth tests are reusable evidence for extracted behavior, but they target the transitional package family |
| `test/packages/db-context/pg-session-db-context.applier.spec.ts` | partial | package-level DB-context tests are reusable evidence, but they target the transitional package family |
| `test/packages/db-context/response-event-request-db-client-lifecycle.spec.ts` | partial | package-level DB-context tests are reusable evidence, but they target the transitional package family |
| `test/packages/db-context/tenant-lifecycle.middleware.spec.ts` | partial | package-level DB-context tests are reusable evidence, but they target the transitional package family |
| `test/packages/frontend-client/api-client.spec.ts` | partial | package-level frontend-client tests are reusable evidence, but they target the transitional package family |
| `test/packages/frontend-client/session-manager.spec.ts` | partial | package-level frontend-client tests are reusable evidence, but they target the transitional package family |
| `test/packages/idempotency/idempotency.interceptor.spec.ts` | partial | package-level idempotency tests are reusable evidence, but the implementation target is still different from spec |
| `test/packages/identity-admin/identity-admin.service.spec.ts` | partial | package-level identity-admin tests are reusable evidence, but the capability is not yet shaped as the final spec package set |
| `test/packages/identity-admin/integration-facades.spec.ts` | partial | package-level identity-admin tests are reusable evidence, but the capability is not yet shaped as the final spec package set |
| `test/packages/identity-admin/pg-local-sync.adapter.spec.ts` | partial | package-level identity-admin tests are reusable evidence, but the capability is not yet shaped as the final spec package set |
| `test/packages/jest.config.ts` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `test/packages/package-lock.json` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `test/packages/package.json` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `test/packages/pipeline/platform-pipeline.module.spec.ts` | divergent | tests target non-spec transitional package concerns rather than a v1 deliverable |
| `test/packages/rate-limit/rate-limit.guard.spec.ts` | partial | package-level rate-limit tests are reusable evidence, but the implementation target is still different from spec |
| `test/packages/sla/sla-monitor.interceptor.spec.ts` | divergent | tests target non-spec transitional package concerns rather than a v1 deliverable |
| `test/packages/tsconfig.test.json` | divergent | file does not align cleanly with the v1 topology and appears to belong to the transitional or legacy implementation surface |
| `test/scripts/package.json` | divergent | script tests validate the legacy script surface rather than the target CLI/governance toolchain |
| `test/scripts/validate.js` | divergent | script tests validate the legacy script surface rather than the target CLI/governance toolchain |

### 1.7 Generated / Local Output Policy

Generated and cache trees are intentionally excluded from the authoritative first-party file inventory above. Under the strict policy, every file in these trees is classified `obsolete` by rule because it is output state, not source-of-truth implementation.

| Tree / glob | Files present | Category | Reason |
|---|---:|---|---|
| `apps/reference-backend/dist/**` | 256 | obsolete | generated output, cache state, or local filesystem noise rather than source code |
| `apps/reference-frontend/dist/**` | 88 | obsolete | generated output, cache state, or local filesystem noise rather than source code |
| `packages/*/dist/**` | 484 | obsolete | generated output, cache state, or local filesystem noise rather than source code |
| `frontend/.angular/cache/**` | 0 | obsolete | generated output, cache state, or local filesystem noise rather than source code |
| `*.DS_Store` | 0 | obsolete | generated output, cache state, or local filesystem noise rather than source code |

### 1.8 Missing Spec'd Artifacts

These are specified in the v1.0 topology but absent from the current repo state.

- `pnpm-workspace.yaml` — missing.
- `turbo.json` — missing.
- `.changeset/config.json` — missing.
- `.npmrc for GitHub Packages scopes` — missing.
- `.github/workflows/ci.yml` — missing.
- `.github/workflows/release.yml` — missing.
- `.github/workflows/ephemeral-env.yml` — missing.
- `.github/CODEOWNERS` — missing.
- `.github/dependabot.yml or Renovate config` — missing.
- `.prettierrc` — missing.
- `commitlint.config.cjs` — missing.
- `Husky hooks (.husky/pre-commit, .husky/commit-msg)` — missing.
- `packages/core/` — missing.
- `packages/auth/` — missing.
- `packages/tenancy/` — missing.
- `packages/data/` — missing.
- `packages/storage/` — missing.
- `packages/audit/` — missing.
- `packages/logging/` — missing.
- `packages/health/` — missing.
- `packages/sessions/` — missing.
- `packages/ratelimit/` — missing.
- `packages/idempotency/` — missing.
- `packages/privacy/` — missing.
- `packages/i18n/` — missing.
- `packages/testing/` — missing.
- `packages/contracts/ under the correct `@stynx` naming and v1 surface` — missing.
- `packages/cli/` — missing.
- `packages-web/ top-level` — missing.
- `packages-web/sdk/` — missing.
- `packages-web/angular/` — missing.
- `packages-web/angular-auth/` — missing.
- `packages-web/angular-tenancy/` — missing.
- `packages-web/angular-storage/` — missing.
- `packages-web/angular-sessions/` — missing.
- `packages-web/angular-profile/` — missing.
- `packages-web/angular-trash/` — missing.
- `packages-web/angular-i18n/` — missing.
- `packages-web/angular-ui/` — missing.
- `tools/tsconfig/` — missing.
- `tools/eslint-config/` — missing.
- `tools/migration-linter/` — missing.
- `apps/reference-api/` — missing.
- `apps/reference-web/` — missing.
- `infra/cdk/` — missing.
- `root Docusaurus docs site as a buildable app under `docs/`` — missing.

## 2. Package-Level Matrix

| Package | Exists? | % complete | Notable gaps | Effort |
|---|---:|---:|---|---|
| `@stynx/core` | No | 10% | Pieces scattered across `packages/stynx-backend` and `backend/src/core/logging`; missing dynamic module, CLS request context, zod config, secret loader, error filter, system context | XL |
| `@stynx/auth` | No | 20% | Cognito verification exists in `@stech/stynx-auth-cognito` and guards exist in `@stech/stynx-backend`, but no STYNX session exchange, no permission cache, no ADR-002 effective-hash paths, no auth admin APIs | XL |
| `@stynx/tenancy` | No | 15% | Header-based tenant handling exists, but no spec tenancy module, no tenant saga lifecycle, no cross-tenant/system-context model, no platform endpoints matching spec | L |
| `@stynx/data` | No | 5% | Only raw `pg` wrapper and legacy SQL; no Drizzle schema, three-role pools, tx helper, GUC contract, archive helpers, migration runner, or soft-delete API | XL |
| `@stynx/storage` | No | 20% | S3 adapter exists and legacy storage module exists, but no `storage.documents` model, no collection registry, no presign-complete-quarantine flow, no archive-aware hard delete | XL |
| `@stynx/audit` | No | 25% | Trigger/function and SQL sink exist, but no partitioned audit log, no archive suppression contract, no module/read API matching spec, no retention/detach job | XL |
| `@stynx/logging` | No | 15% | Legacy logging interceptors exist, but no dedicated package, no Pino integration, no structured base fields/redaction enforcement/dedup transport | M |
| `@stynx/health` | No | 20% | Legacy health endpoints exist, but no `/healthz` `/readyz` `/metrics` `/info` package with pluggable indicators and Prometheus metrics surface | M |
| `@stynx/sessions` | No | 0% | Entire Redis-backed STYNX session store/JWKS/rotation/revocation model absent | XL |
| `@stynx/ratelimit` | No | 20% | Rate-limit guard/store exists inside `@stech/stynx-backend`, but wrong package boundary and no Redis Lua sliding-window implementation | L |
| `@stynx/idempotency` | No | 20% | Idempotency interceptor/store exists inside `@stech/stynx-backend`, but not Redis + durable replay design from spec | L |
| `@stynx/privacy` | No | 0% | Entire PII map/export/erasure/retention/ROPA pipeline absent | XL |
| `@stynx/i18n` | No | 0% | Only app-local translation JSONs; no runtime catalog aggregator, locale resolver, or localized error pipeline | L |
| `@stynx/testing` | No | 10% | Central test directories exist, but no Testcontainers harness, no STYNX matchers, no doctor helper, no fixture factory package | XL |
| `@stynx/contracts` | No | 30% | `@stech/stynx-contracts` is a real start, but names, exports, and domain coverage do not match v1 packages/contracts/data/auth/session/privacy contracts | M |
| `@stynx/cli` | No | 0% | No init/migrate/doctor/adopt CLI in monorepo package form | XL |
| `@stynx-web/sdk` | No | 20% | `@stech/stynx-frontend-client` offers manual client helpers, but no OpenAPI-generated SDK or pluggable STYNX transport surface | L |
| `@stynx-web/angular` | No | 5% | Only a thin reference frontend exists; no reusable Angular core module/interceptors package | XL |
| `@stynx-web/angular-auth` | No | 0% | Absent | L |
| `@stynx-web/angular-tenancy` | No | 0% | Absent | M |
| `@stynx-web/angular-storage` | No | 0% | Absent | M |
| `@stynx-web/angular-sessions` | No | 0% | Absent | M |
| `@stynx-web/angular-profile` | No | 0% | Absent | M |
| `@stynx-web/angular-trash` | No | 0% | Absent; especially blocked on archive model and restore API | M |
| `@stynx-web/angular-i18n` | No | 0% | Absent | M |
| `@stynx-web/angular-ui` | No | 0% | Absent | M |


### 2.1 Salvageability Criteria

| Salvage class | Standard | Recommended action |
|---|---|---|
| `high` | Feature intent and implementation core survive with bounded extraction, rename, and contract cleanup | Preserve code as migration substrate; rewrite package shell and tests around it |
| `medium` | Only specific subtrees or adapters survive; current package shell and public API do not | Mine selected files and tests; do not preserve the current package surface |
| `low` | Code is useful mainly as behavioral evidence or temporary reference, not as an implementation baseline | Re-read for behavior, then rewrite cleanly under the spec topology |
| `none` | Package mostly encodes the wrong architecture or a non-spec concern | Delete or quarantine during the package split |

### 2.2 Current Package Salvage Register

| Current package / surface | Salvage | What is worth keeping | What should not survive intact |
|---|---|---|---|
| `packages/stynx-contracts` | `high` | shared DTO/error/interface vocabulary, barrel structure discipline, existing package tests as coverage seed | `@stech` scope, incomplete contract coverage, package name/layout |
| `packages/stynx-auth-cognito` | `high` | Cognito token validation and JWKS-facing adapter ideas | current standalone package shape; it should fold into `@stynx/auth` |
| `packages/stynx-auth-cognito-admin` | `medium` | Cognito admin adapter and error-mapping ideas | separate package identity; final behavior belongs inside auth/tenancy internals |
| `packages/stynx-storage-s3` | `high` | thin S3 wrapper and bucket/presign adapter ideas | standalone package boundary without registry/archive semantics |
| `packages/stynx-audit-sql` | `medium` | SQL sink and trigger-facing adapter ideas | present schema assumptions and package-level finality |
| `packages/stynx-frontend-contracts` | `medium` | generic frontend auth/http contracts | final package location and naming; should move under `packages-web/*` |
| `packages/stynx-frontend-client` | `medium` | fetch transport, JWT parsing, principal hydration | implicit Cognito flow defaults and token-store semantics |
| `packages/stynx-backend` | `medium` | selected `audit`, `auth`, `authorization`, `common/request-context`, `db-context`, `idempotency` interceptor, `rate-limit` guard, and `storage` subtrees | monolithic package shell, SQL-backed idempotency/rate-limit stores, `pipeline`, `sla` |

Non-package salvage pools that still matter:

- `backend/`: `low`. Mine feature behavior and DTO/controller expectations only; do not preserve it as the runtime foundation.
- `frontend/`: `low`. Mine UI flow and copy/catalog seeds only; do not preserve it as the web architecture baseline.
- `db/ddl/`: `low`. Mine helper and trigger ideas, but do not treat the DDL as the v1 migration baseline.


## 3. Invariant Compliance Check

| Invariant | Enforceable now? | Current mechanism | Assessment |
|---|---|---|---|
| `I1` No raw DB connection | No | Absent | Violated by `backend/src/shared/database/database.service.ts` using direct `pg` Pool/PoolClient; no single `@stynx/data` connection manager exists |
| `I2` No query outside request context | No | Partial runtime convention only | Some request context plumbing exists in `packages/stynx-backend/src/db-context/*`, but nothing prevents direct DB calls without active request/tenant/system context |
| `I3` No direct S3 client outside storage package | No | Absent | Direct S3 client usage exists in storage adapter and legacy app code with no repository-wide lint boundary |
| `I4` Every HTTP route has a permission/public/system annotation | No | Partial runtime guard/decorator patterns | Some controllers use `@RequireRoles` and `@Audit`, but there is no CI/lint gate ensuring every route is annotated; health/auth routes show mixed coverage |
| `I5` Every tenant-scoped table has `tenant_id uuid NOT NULL` and RLS | Partially | SQL helpers + some explicit policies | Parts of `auth.*` and `storage.files` have RLS, but naming and schema shapes diverge (`tenancy_id` in multiple places), platform schemas are incomplete, and coverage is not universal |
| `I6` Every mutation is audited unless explicitly exempted | No | Partial DB trigger coverage + route decorator usage | `audit.fn_log_dml()` and `@Audit` exist, but not every mutation path is covered and there is no spec-style `@NoAudit` governance gate |
| `I7` Read-only clients use the RO role | No | Absent | No `stynx_reader` role, no reader pool, no `@ReadOnly()` routing to RO connections |
| `I8` Every tenant-scoped table is soft-deletable via archive mirror unless opted out | No | Absent | Current schema uses live-table `deleted_at` on `storage.files`, has no `archive` schema mirrors, and no migration linter/helper enforcing mirror parity |


### 3.1 SQL/DDL Classification By Invariant Impact

| File | Current classification | Helps | Hurts | Conclusion |
|---|---|---|---|---|
| `db/ddl/00-extensions.sql` | `partial` | seeds part of the eventual extension bootstrap | misses `citext`, `pg_stat_statements`, role ownership, and versioned migration structure | keep as a reference snippet only |
| `db/ddl/01-auth.sql` | `divergent` | shows prior tenant/RLS helper patterns | bakes in ad hoc `auth.*`/`stynx.*` GUCs, mixed tenancy key naming, and no three-role/archive model, so it works against I1/I2/I5/I7/I8 | do not use as the v1 migration baseline |
| `db/ddl/02-audit.sql` | `divergent` | preserves useful trigger and PK-extraction ideas for I6 | current `audit.events` table shape, RLS policy, and non-partitioned retention model conflict with the spec audit design and archive-move semantics | salvage trigger concepts only |
| `db/ddl/03-storage.sql` | `divergent` | shows a prior tenant-scoped storage registry shape | live-table `deleted_at` directly violates ADR-001 and I8, and the table shape does not match `storage.documents` | rewrite completely under the data helpers |


## 4. Critical Path

### 4.1 Prompts That Are Near No-Ops

There are no literal no-op prompts. The repo has useful transitional material, but every prompt still needs substantive implementation or reconciliation work.

The closest to partial carry-forward only are:

- Prompt 13 (`@stynx/tenancy`): some tenant-resolution and membership ideas already exist, but the package still has to be created and normalized.
- Prompt 18 (`@stynx/ratelimit`): existing guard/store concepts can be mined, but the Redis/Lua design is missing.
- Prompt 19 (`@stynx/idempotency`): existing interceptor/store concepts can be mined, but the spec storage/replay design is missing.
- Prompt 25 (`@stynx-web/sdk`): `@stech/stynx-frontend-client` provides reusable primitives, but generation and package contract are still absent.
- Prompt 30 / 31 (reference apps): there are reference app stubs, but they need wholesale expansion and renaming.

### 4.2 Prompts That Will Do Most Of The Work

The bulk of the work sits in these prompt clusters:

- Prompts 1-3: repo foundation must be rebuilt from npm workspace to pnpm/turbo/changesets/CI governance.
- Prompts 4-12: core/data/archive/migration-linter is the single largest architectural delta.
- Prompts 14-17: sessions/auth/audit/storage require major new runtime and schema work.
- Prompts 20-24: testing harness, privacy pipeline, i18n, and CLI are effectively greenfield.
- Prompts 26-29: entire `packages-web/*` family is absent.
- Prompts 32-37: infra, performance, mutation testing, docs site, and release hardening are absent.

### 4.3 Recommended Real Execution Focus

If this repo is to reach v1.0 with the least compounding rework, the order of practical risk burn-down is:

1. Prompt 1-3 first: stop adding more npm/legacy drift.
2. Prompt 4-12 next: establish `@stynx/core` + `@stynx/data` + archive model before expanding features on top.
3. Prompt 14-17 after the data layer: auth/session/audit/storage depend on the data and archive contract.
4. Everything else after those foundations are stable.

## 5. Risk Register

### R1. Package topology drift is already expensive

Current reusable code is organized under `@stech/stynx-backend`, `@stech/stynx-auth-cognito`, `@stech/stynx-storage-s3`, and related packages. The spec requires many smaller `@stynx/*` packages with stricter boundaries. If new work keeps landing in the current collapsed packages, the eventual split will get harder and riskier.

### R2. Legacy app surfaces are still the primary runtime

`backend/` and `frontend/` are not just leftovers; they still carry real behavior. That means the repo currently has at least two competing architectural centers: legacy runnable apps and the transitional package family. Continuing in that state compounds duplication and makes invariants unenforceable.

### R3. The current DB contract is incompatible with the spec core

The live DB access path is a raw `pg` service that sets custom `auth.*` / `stynx.*` session variables. The spec depends on a three-role pool topology, transaction-scoped `app.*` GUCs, and a dedicated `@stynx/data` API. This is not an incremental rename; it is a new data layer.

### R4. Soft-delete architecture currently points the wrong way

ADR-001 and SPEC §14 explicitly choose archive-schema soft delete as the v1 mechanism. The existing SQL and storage model still use live-table deletion metadata (`storage.files.deleted_at`) and have no `archive` schema. Any additional CRUD/storage work built on top of the current model will be throwaway.

### R5. Audit design will need a second rewrite if built on current assumptions

Current audit state is `audit.events` plus a generic trigger function. The spec requires partitioned audit storage, explicit archive-move suppression logic, archive-direct audit semantics, retention/detach jobs, and a platform read API. Reusing the current trigger code is possible, but treating the present schema as stable would be a mistake.

### R6. Auth/session design is far from the spec’s bearer model

There is Cognito verification and role-based gating, but the STYNX session family, Redis-backed revocation indexes, JWKS exposure, tenant switching, and ADR-002 permission cache are absent. Building more route-level authz on the current direct-Cognito model risks locking in the wrong abstraction.

### R7. Reference apps are misleadingly reassuring

`apps/reference-backend` and `apps/reference-frontend` exist, but they are demonstration stubs. They do not exercise the spec’s domain, archive flows, auth/session lifecycle, or frontend package family. Treating them as “done reference apps” would hide a large amount of remaining work.

### R8. Generated artifacts are polluting the repo state

`dist/**`, local Angular cache content, and multiple `package-lock.json` files are present alongside source. That is survivable during a transition, but it makes audit/review noisier and fights the spec’s release/governance posture.

### R9. Tooling/governance drift is already visible in repo metadata

The repo still advertises npm workspace commands in `README.md` and transitional docs under `docs/stynx/`. Until Prompt 1-3 land, every further change increases the amount of governance/documentation migration required later.

### R10. Prompt-sequence operational assumption mismatch

The prompt sequence assumes branch-per-prompt + PR + CI output. In this checkout, branch creation is blocked by local Git ref write permissions. That does not block code analysis, but it does block strict adherence to the operational workflow until the checkout permissions issue is corrected.
