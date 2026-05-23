# Porting Pack — Discovery Notes

> **NOT a final pack artifact.** This file is the grounding for every
> downstream `PORT-NN` prompt. Subsequent prompts cite this file or
> re-read the cited sources directly.
>
> **Source baseline:** commit `670d165253efd66113e338cd0c79d4c8fcbc8be7`
> on branch `clean/doc-pass`, 2026-04-27.

## 0. Important — audit baseline drift

The audit at `docs/work/audit/` (commit `457da90`, 2026-04-27 morning)
flagged BLOCKERs and MAJORs that **have already been closed** at the
discovery commit. Cross-check before treating any audit finding as
current:

| Finding                                         | Audit status | Discovery status | Evidence                                                                                                                                                |
| ----------------------------------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIND-001 (`@stynx/contracts` missing)           | BLOCKER      | **CLOSED**       | `packages/contracts/package.json` (`@stynx/contracts@0.2.0`, 8 exports)                                                                                 |
| FIND-002 (`@stynx-web/angular-tenancy` missing) | BLOCKER      | **CLOSED**       | `packages-web/angular-tenancy/package.json` (6 exports)                                                                                                 |
| FIND-003 (`apps/reference-frontend` legacy)     | MINOR        | **CLOSED**       | `apps/` has only `reference-api`, `reference-web`                                                                                                       |
| FIND-005 (EdgeStack missing)                    | MAJOR        | **CLOSED**       | `infra/cdk/lib/edge-stack.ts` present                                                                                                                   |
| FIND-006 (`@stech/*` legacy packages)           | MAJOR        | **CLOSED**       | `pnpm -r ls` shows no `@stech/*`; `@stynx/backend@0.2.0` is the rationalized successor                                                                  |
| FIND-007 (non-spec workspace globs)             | MAJOR        | **CLOSED**       | `pnpm-workspace.yaml` is `packages/*`, `packages-web/*`, `apps/*`, `tools/*`, `docs` only                                                               |
| FIND-013 (Node engine drift)                    | MAJOR        | **PARTIAL**      | `.nvmrc` = 24, `package.json` engines pins node 24, `engines.node = ">=24 <25"`. Local shell still on v22, but the toolchain config is correct          |
| FIND-014 (READMEs absent)                       | MAJOR        | **PARTIAL**      | All 27 packages now have a `README.md`. TSDoc density not re-measured                                                                                   |
| FIND-024 (CODEOWNERS coverage ~20 %)            | MAJOR        | **CLOSED**       | `.github/CODEOWNERS` covers `/packages/`, `/packages-web/`, `/tools/`, `/infra/`, `/apps/`, `/.github/`, `/specs/`, `/docs/`, `/test/`, top-level globs |
| FIND-025 (no declarative branch protection)     | MAJOR        | **CLOSED**       | `infra/github/main.tf` (Terraform) declares branch protection                                                                                           |

Findings still likely live (not re-verified in this discovery pass —
re-check before relying on them):

- FIND-004 (migration-linter test failing on repo migrations).
- FIND-010 (`@stynx/privacy` I3 violation — direct `@aws-sdk/client-s3`).
- FIND-011 (`pnpm doctor` empty output).
- FIND-026 (Conventional Commits compliance ~37 %).
- FIND-031 (operations runbooks absent).

Downstream prompts must mark surfaces consistently with **discovery
state**, not audit state.

## 1. Repo topology

`ls -la` at root yields these top-level entries:

| Entry                                                        | Notes                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `specs/`                                                     | 15 files; spec set + GAP-00x docs (see §2)                             |
| `packages/`                                                  | 17 backend packages (see §3)                                           |
| `packages-web/`                                              | 10 frontend packages (see §3)                                          |
| `apps/`                                                      | `reference-api`, `reference-web`                                       |
| `tools/`                                                     | `eslint-config`, `tsconfig`, `migration-linter`, `ci-local`, `stryker` |
| `infra/`                                                     | `cdk/` (CDK app), `github/` (Terraform branch protection)              |
| `docs/`                                                      | Docusaurus + `docs/work/` (audit, rationalization, specs, prompts)     |
| `.github/`                                                   | 8 workflows, CODEOWNERS, PR template                                   |
| `.husky/`                                                    | Git hooks (pre-commit, commit-msg)                                     |
| `.changeset/`                                                | Changesets v2                                                          |
| `perf/`                                                      | k6 scripts + results                                                   |
| `scripts/`                                                   | Operational scripts (`stynx-doctor.mjs`, `ci-local`, etc.)             |
| `package.json`                                               | `stynx-workspace@0.2.0`, pnpm 9.15.0, node `>=24 <25`                  |
| `pnpm-workspace.yaml`                                        | spec-compliant globs (see §1.3)                                        |
| `turbo.json`                                                 | build/lint/typecheck/test/test:int/test:e2e tasks                      |
| ``.nvmrc`, `package.json` engines                            | Node 24, pnpm 9.15.0 pinned                                            |
| `tools/repo-config/commitlint.config.cjs`, `CONTRIBUTING.md` | governance docs present                                                |
| `db/`, `audit/`, `reports/`                                  | small auxiliary directories (low-priority for porting)                 |

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'packages-web/*'
  - 'apps/*'
  - 'tools/*'
  - 'docs'
```

## 2. Spec set found

Under `specs/`:

| File                             | Lines  | Role                                   |
| -------------------------------- | ------ | -------------------------------------- |
| `STYNX-SPEC-v0.6.md`             | 1218   | **Normative spec** (current version)   |
| `STYNX-API-DATA.md`              | 618    | `@stynx/data` API contract             |
| `STYNX-ADR-001-soft-delete.md`   | 286    | Archive-mirror soft-delete decision    |
| `STYNX-ADR-002-perms-caching.md` | 245    | Three-tier permission cache decision   |
| `STYNX-REFERENCE-MIGRATION.sql`  | 468    | Canonical migration example            |
| `STYNX-CDK-SKELETON.md`          | 843    | CDK stack skeleton                     |
| `STYNX-ADOPT-EXAMPLE.md`         | 462    | Pre-existing adoption example          |
| `STYNX-CODEX-PROMPTS.md`         | 1318   | Implementation playbook (Prompts 0–37) |
| `GAP-000` … `GAP-006`            | 93–274 | Open gaps per area                     |

## 3. Invariants list (verbatim from `STYNX-SPEC-v0.6.md` §1.3)

Read at `specs/STYNX-SPEC-v0.6.md` lines ~52–70 for I1, lines ~60–70 for I2–I8:

- **I1 — No raw DB connection.** All DB access goes through STYNX's
  connection manager, which sets `app.tenant_id`, `app.actor_id`,
  `app.request_id`, `app.session_id` GUCs on every transaction.
- **I2 — No query outside a request context.** Background work
  obtains an explicit `TenantContext` via `withSystemContext(reason, fn)`.
- **I3 — No direct S3 client.** All object operations go through
  `@stynx/storage`.
- **I4 — Every HTTP route has a permission.** Routes without
  `@Permission(...)`, `@Public()`, or `@System()` fail CI.
- **I5 — Every tenant‑scoped table has `tenant_id uuid NOT NULL` and an RLS policy.**
- **I6 — Every mutation is audited** unless annotated `@NoAudit('reason')`.
- **I7 — Read‑only clients use the RO role.** `@ReadOnly()` routes
  connect via `stynx_reader`.
- **I8 — Every tenant‑scoped table is soft‑deletable** unless annotated
  `@NoSoftDelete('reason')`. Soft‑deletable tables MUST have a
  corresponding `archive.{schema}_{table}` mirror declared in the same
  migration. Live tables of soft‑deletable entities do **not** carry
  `deleted_at`/`deleted_by` columns — deletion metadata lives in the
  archive mirror only.

## 4. Package inventory

### 4.1 Backend (`packages/`, 17 entries)

| Name                 | Version | Exports | Tests | README |
| -------------------- | ------- | ------- | ----- | ------ |
| `@stynx/audit`       | 0.1.0   | 8       | 3     | Y      |
| `@stynx/auth`        | 0.1.0   | 20      | 12    | Y      |
| `@stynx/backend`     | 0.2.0   | 44      | 0     | Y      |
| `@stynx/cli`         | 0.1.0   | 7       | 3     | Y      |
| `@stynx/contracts`   | 0.2.0   | 8       | 0     | Y      |
| `@stynx/core`        | 0.1.0   | 11      | 5     | Y      |
| `@stynx/data`        | 0.1.0   | 12      | 6     | Y      |
| `@stynx/health`      | 0.1.0   | 6       | 4     | Y      |
| `@stynx/i18n`        | 0.1.0   | 9       | 1     | Y      |
| `@stynx/idempotency` | 0.1.0   | 10      | 2     | Y      |
| `@stynx/logging`     | 0.1.0   | 6       | 5     | Y      |
| `@stynx/privacy`     | 0.1.0   | 9       | 2     | Y      |
| `@stynx/ratelimit`   | 0.1.0   | 10      | 3     | Y      |
| `@stynx/sessions`    | 0.1.0   | 10      | 2     | Y      |
| `@stynx/storage`     | 0.1.0   | 7       | 3     | Y      |
| `@stynx/tenancy`     | 0.1.0   | 10      | 4     | Y      |
| `@stynx/testing`     | 0.1.0   | 8       | 1     | Y      |

**Note:** `@stynx/backend` and `@stynx/contracts` are at 0.2.0; the rest
at 0.1.0 — likely the rationalization seam from `@stech/*` predecessors.

**Spec drift:** spec §3 lists 16 backend packages (no `@stynx/backend`).
The repo adds `@stynx/backend` as an aggregator/composition module —
its 44 exports include `StynxPlatformPipelineModule`, `AuditInterceptor`,
`STYNX_AUDIT_SINK` (per `apps/reference-api/src/app.module.ts:11`).
Treat `@stynx/backend` as STABLE-but-undocumented-in-spec; subsequent
prompts must consult its `README.md` and barrel.

### 4.2 Frontend (`packages-web/`, 10 entries)

| Name                          | Version | Exports | Tests | README |
| ----------------------------- | ------- | ------- | ----- | ------ |
| `@stynx-web/angular`          | 0.1.0   | 12      | 1     | Y      |
| `@stynx-web/angular-auth`     | 0.1.0   | 13      | 1     | Y      |
| `@stynx-web/angular-i18n`     | 0.1.0   | 6       | 1     | Y      |
| `@stynx-web/angular-profile`  | 0.1.0   | 3       | 1     | Y      |
| `@stynx-web/angular-sessions` | 0.1.0   | 2       | 1     | Y      |
| `@stynx-web/angular-storage`  | 0.1.0   | 5       | 1     | Y      |
| `@stynx-web/angular-tenancy`  | 0.1.0   | 6       | 1     | Y      |
| `@stynx-web/angular-trash`    | 0.1.0   | 2       | 1     | Y      |
| `@stynx-web/angular-ui`       | 0.1.0   | 8       | 1     | Y      |
| `@stynx-web/sdk`              | 0.1.0   | 14      | 1     | Y      |

All ten spec'd frontend packages present. `@stynx-web/angular-tenancy`
is no longer the audit's BLOCKER; it has 6 exports and 1 test.

## 5. Reference-app patterns observed

`apps/reference-api/src/app.module.ts` composes the platform modules:

```ts
import { PermissionGuard, StynxAuthGuard, StynxAuthModule } from '@stynx/auth';
import { StynxPlatformPipelineModule, AuditInterceptor, STYNX_AUDIT_SINK } from '@stynx/backend';
import { Database, StynxDataModule } from '@stynx/data';
import { StynxHealthModule } from '@stynx/health';
import { StynxLoggingModule } from '@stynx/logging';
import { StynxSessionsModule } from '@stynx/sessions';
import { StynxStorageModule } from '@stynx/storage';
import { StynxTenancyModule } from '@stynx/tenancy';
import { AuditSqlSink, StynxAuditModule as StynxAuditApiModule } from '@stynx/audit';
```

(`apps/reference-api/src/app.module.ts:1–24`)

Sample domain controllers under `apps/reference-api/src/sample/`:

- `records.controller.ts`, `record-notes.controller.ts`,
  `documents.controller.ts`, `work-items.controller.ts`,
  `work-item-entries.controller.ts`, `work-item-locks.controller.ts`,
  `reference-probes.controller.ts`, `reference-dev-auth.controller.ts`.

These are the canonical "service uses STYNX" examples.

Reference web app: `apps/reference-web/`.
Local stack: `apps/reference-api/docker-compose.yml`.
**No `apps/reference-api/.env.example` was found** — `[GAP — env-var
catalog must be derived from `app.module.ts` and CDK code instead]`.

## 6. Migration system

### 6.1 Platform migrations — `packages/data/migrations/platform/`

Run order:

```
0001_roles.sql           — stynx_owner / stynx_app / stynx_reader roles
0002_extensions.sql      — pgcrypto, etc.
0003_schemas.sql         — core / tenancy / auth / audit / storage / archive / data / public
0004_tenancy.sql         — tenancy.tenants, tenant lifecycle states
0005_auth.sql            — memberships, permissions, role assignments
0006_auth_effective_hash.sql — perms_hash machinery (ADR-002)
0007_core.sql            — core meta tables
0008_audit.sql           — audit log + trigger
0009_grants_ddl_privileges.sql — role grants
0010_data_helpers.sql    — data.create_soft_deletable_table, etc.
0011_storage.sql         — storage tables + RLS
0012_ratelimit_idempotency.sql — rate-limit + idempotency tables
0012_tenancy_lifecycle.sql — tenancy lifecycle (note: same prefix 0012)
```

[GAP — two `0012_*.sql` files share the same prefix; verify ordering
expectations before porting.]

### 6.2 Reference-app migration

`apps/reference-api/migrations/0001_reference.sql` — single consumer
migration; uses `data.create_soft_deletable_table` (per audit
[02-SPEC-ADHERENCE.md] line 89). Subsequent prompts that need a
worked example pull from this file.

### 6.3 SQL helpers — `packages/data/migrations/platform/0010_data_helpers.sql`

Helpers exposed (signatures to be enumerated by PORT-08 reading the
file directly):

- `data.create_soft_deletable_table(...)` — auto-creates archive
  mirror, RLS policies, and audit trigger binding.
- Likely also: helpers for FK annotation, archive-table introspection.

`[VERIFY in PORT-08 — exhaustive helper signatures]`

## 7. Migration linter

Source: `tools/migration-linter/src/lint.ts` (single file; rules are
inline rather than separate files).

Issue codes (from `tools/migration-linter/src/types.ts:1–13`):

```ts
export const LINT_CODES = [
  'LINT001',
  'LINT002',
  'LINT003',
  'LINT004',
  'LINT005',
  'LINT006',
  'LINT007',
  'LINT008',
  'LINT009',
] as const;
```

Each code's meaning: `[VERIFY in PORT-08 by reading `lint.ts:520–620`
where each code is emitted with its surrounding context]`.

Audit baseline noted FIND-004 (linter test failing on repo migrations).
**Re-verify before treating the linter as a hard gate.**

## 8. CLI commands

Source: `packages/cli/src/cli.ts:1–28` shows `commander`-based program
named `stynx`. Imports indicate command set:

| Command                                                                   | Source                             |
| ------------------------------------------------------------------------- | ---------------------------------- |
| `stynx init <app-name>`                                                   | `packages/cli/src/init.ts`         |
| `stynx adopt scan` / `apply` / `apply-permissions` / `link-cognito-users` | `packages/cli/src/adopt.ts`        |
| `stynx audit verify` (chain integrity)                                    | `packages/cli/src/audit.ts`        |
| `stynx doctor`                                                            | `packages/cli/src/doctor.ts`       |
| `stynx migrate up` / `down` / `redo` / `status`                           | `packages/cli/src/migrate.ts`      |
| `stynx privacy ropa`                                                      | `packages/cli/src/privacy-ropa.ts` |

Direct invocation via `pnpm --filter @stynx/cli exec stynx --help`
**failed** with `Command "stynx" not found` (no bin linked at the
filter scope). The CLI is invoked through `node packages/cli/dist/main.js`
or via the monorepo's `pnpm doctor` (top-level script).

`[GAP — bin name resolution; consuming agents should call the CLI
through whatever wrapper their app exposes, not via `pnpm exec stynx`.]`

## 9. CI & governance

`.github/workflows/`:

| Workflow                | Purpose                         |
| ----------------------- | ------------------------------- |
| `ci.yml`                | lint, typecheck, test           |
| `hardening.yml`         | security + k6                   |
| `release-prep.yml`      | changeset prep                  |
| `release.yml`           | publish                         |
| `release-artifacts.yml` | artifact bundling               |
| `docs.yml`              | docs build                      |
| `ephemeral-env.yml`     | preview envs                    |
| `semantic-pr-title.yml` | PR title commitlint enforcement |

`.github/CODEOWNERS` covers `/packages/*`, `/packages-web/*`, `/tools/*`,
`/infra/*`, `/apps/*`, `/.github/`, `/specs/`, `/docs/`, `/test/`, plus
`/* @aarusso-nyx` catch-all. **Single-owner repo at this commit** —
multi-reviewer policy from spec §17.5 is structurally not yet enforced.

`infra/github/main.tf` declares branch protection in Terraform.
`tools/repo-config/commitlint.config.cjs` exists. Husky hooks at `.husky/`.

## 10. `@stynx/data` exported surface (verified at HEAD)

From `packages/data/src/index.ts`:

```
StynxDataModule (alias DataModule)
Database
Transaction, createDrizzle, type StynxDrizzleDatabase
StynxPoolRegistry, createStynxPgPool, type StynxPgPoolOptions
createStynxPgClient, type StynxPgClient, type StynxPgClientConfig
withSystemContext
* from './table-markers'
* from './types'
* from './errors'
* from './tokens'
* from './schema'
* from './query-helpers'
```

Transaction methods (from `packages/data/src/transaction.ts`, grep
`^  async`):

- `softDelete(table, id, options?)` — overloads at lines 128/133/138
- `restoreFromArchive(table, id, options?)` — line 172
- `restoreFromArchive` convenience wrapper — line 193
- `hardDelete(table, id, options)` — line 199
- `hardDeleteFromArchive(...)` — line 213
- private `softDeleteByReference` (cascade engine) — line 305

`createDrizzle(client)` — line 61.
`StynxDrizzleDatabase = NodePgDatabase<typeof schema>` — line 32.
`Transaction` class — line 81.

`Database` (from `packages/data/src/database.ts:1–30`) imports
`Database as CoreDatabase` from `@stynx/core` and adds tenancy / actor
context plumbing via `nestjs-cls`. Errors raised:
`ActorContextMissingError`, `ReadOnlyViolationError`,
`SerializationFailureError`, `StatementTimeoutError`,
`TenantContextMissingError`.

## 11. Open questions surfaced during discovery

These feed `18-GAPS-AND-OPEN-QUESTIONS.md`:

1. **`@stynx/backend` is undocumented in spec §3** but is the actual
   composition module the reference-api imports
   (`StynxPlatformPipelineModule`, `AuditInterceptor`, `STYNX_AUDIT_SINK`).
   Severity: MAJOR for porting — agents need to know to import from it.
2. **Two `0012_*.sql` migrations** share the same numeric prefix in
   `packages/data/migrations/platform/`. Severity: MAJOR — ordering may
   surprise consumer migrations layering on top.
3. **No `.env.example`** in `apps/reference-api/` — env-var inventory
   must be reverse-engineered. Severity: MINOR (documentable).
4. **`pnpm exec stynx --help` does not resolve a bin** at the
   filter scope. Severity: MINOR — affects developer ergonomics, not
   the spec.
5. **Migration linter (FIND-004) re-verification owed.** Severity:
   BLOCKER if still failing.
6. **`@stynx/privacy` I3 status (FIND-010) re-verification owed.**
   Severity: BLOCKER if `@aws-sdk/client-s3` still imported directly.
7. **`pnpm doctor` empty-output (FIND-011) re-verification owed.**
   Severity: MAJOR.
8. **Operations runbooks (FIND-031)** — discovery did not re-check
   `docs/ops/`. Severity: MAJOR.

## 12. Audit findings carrying into porting concerns

From `docs/work/audit/07-FINDINGS-REGISTER.md`, the items consuming
agents must know about (post-rationalization survivors):

- **FIND-004** — migration linter regression (verify; if live, port
  agents must hand-validate migrations against the rules listed in §7).
- **FIND-010** — privacy I3 deviation (if live, document as a known
  exception until ADR-003 lands).
- **FIND-011** — doctor empty output (if live, doctor cannot be the
  port's "done" gate).
- **FIND-015** — LGPD pipeline thinly tested (`@stynx/privacy` has 2
  tests at HEAD, up from 1; porting agents using LGPD must add their
  own integration tests).
- **FIND-016** — audit hash-chain (`stynx audit verify` exists per §8;
  whether GAP-001 is fully implemented is `[VERIFY in PORT-04]`).
- **FIND-026** — Conventional Commits compliance ~37 % at audit time;
  re-check via `git log` before claiming closed.
- **FIND-031** — operations runbooks; re-check `docs/ops/`.
