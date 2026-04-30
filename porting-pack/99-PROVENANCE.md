# 99 — Provenance

Reproducibility metadata for this porting pack.

## Metadata

| Field                    | Value                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Generated at**         | 2026-04-27 (UTC)                                                                                                                                                                       |
| **Source repo**          | `/Users/aarusso/Development/stech/stynx`                                                                                                                                               |
| **Source commit SHA**    | `670d165253efd66113e338cd0c79d4c8fcbc8be7`                                                                                                                                             |
| **Source branch**        | `clean/doc-pass`                                                                                                                                                                       |
| **Spec version found**   | `STYNX-SPEC-v0.6.md` (1218 lines)                                                                                                                                                      |
| **Generator**            | Claude Code, model `claude-opus-4-7` (Anthropic)                                                                                                                                       |
| **Generation method**    | Sequence of `PORT-NN` prompts under `porting-pack/_PROMPTS/`, executed inline (small docs) and via parallel `general-purpose` Agent dispatches (large docs); see `_GENERATION-PLAN.md` |
| **Approximate duration** | Single working session, ≈ 90 minutes wall-clock with parallel agent dispatch                                                                                                           |

## Files in the pack (final inventory)

| File                                | Purpose                                   | Origin                |
| ----------------------------------- | ----------------------------------------- | --------------------- |
| `00-README.md`                      | Entry point + file index                  | inline                |
| `_GENERATION-PLAN.md`               | Sequence of prompts                       | inline                |
| `_DISCOVERY.md`                     | Grounding notes from PORT-00              | inline                |
| `_PROMPTS/PORT-NN-*.md`             | Self-contained generation prompts (×21)   | inline                |
| `01-WHAT-IS-STYNX.md`               | Elevator pitch + capability matrix        | inline                |
| `02-IS-STYNX-RIGHT-FOR-YOU.md`      | Fit checklist + decision tree             | inline                |
| `03-CORE-CONCEPTS.md`               | Glossary                                  | inline                |
| `04-INVARIANTS-AND-CONTRACTS.md`    | I1–I8 + cross-cutting contracts           | inline                |
| `05-PACKAGE-CATALOG.md`             | Per-package surface + decision matrix     | inline                |
| `06-DATA-LAYER-PATTERNS.md`         | Database/Transaction patterns             | general-purpose Agent |
| `07-AUTH-AND-TENANCY-PATTERNS.md`   | Auth + tenancy patterns                   | inline                |
| `08-MIGRATION-PATTERNS.md`          | Migration helpers + linter rules          | general-purpose Agent |
| `09-FRONTEND-PATTERNS.md`           | Angular + sdk patterns                    | general-purpose Agent |
| `10-INFRASTRUCTURE-REQUIREMENTS.md` | AWS resources + env vars + secrets        | general-purpose Agent |
| `11-PORTING-PLAYBOOK.md`            | Phase 0..7 playbook + assessment template | inline                |
| `12-DECISION-TREES.md`              | Seven Mermaid decision trees              | general-purpose Agent |
| `13-COMMON-PITFALLS.md`             | Pre-emptive postmortem                    | general-purpose Agent |
| `14-VERIFICATION-CHECKLIST.md`      | Done criteria                             | inline                |
| `15-REFERENCE-EXAMPLES/`            | Five before/after examples                | general-purpose Agent |
| `16-SPEC-EXCERPTS/`                 | Six self-contained spec excerpts          | inline                |
| `17-AGENT-CONTEXT-PACKAGE.md`       | Compact context blob                      | inline                |
| `18-GAPS-AND-OPEN-QUESTIONS.md`     | Honesty document                          | inline                |
| `99-PROVENANCE.md`                  | This file                                 | inline                |

## Files read during generation

A non-exhaustive list of repository files opened during pack
generation. Subagent reads not listed individually.

### Specs

- `specs/STYNX-SPEC-v0.6.md` — primary normative spec
- `specs/STYNX-API-DATA.md` — `@stynx/data` API contract
- `specs/STYNX-ADR-001-soft-delete.md`
- `specs/STYNX-ADR-002-perms-caching.md`
- `specs/STYNX-REFERENCE-MIGRATION.sql`
- `specs/STYNX-CDK-SKELETON.md`
- `specs/STYNX-ADOPT-EXAMPLE.md`
- `specs/STYNX-CODEX-PROMPTS.md`
- `specs/GAP-000-bootstrap.md` … `specs/GAP-006-permission-drift-slo.md`

### Backend packages

- `packages/{audit,auth,backend,cli,contracts,core,data,health,i18n,idempotency,logging,privacy,ratelimit,sessions,storage,tenancy,testing}/package.json`
- `packages/{audit,auth,backend,cli,contracts,core,data,health,i18n,idempotency,logging,privacy,ratelimit,sessions,storage,tenancy,testing}/src/index.ts`
- `packages/data/src/database.ts`, `transaction.ts`,
  `query-helpers.ts`, `system-context.ts`, `errors.ts`
- `packages/auth/src/permission-cache.ts` and decorator/guard files
- `packages/cli/src/cli.ts`, `doctor.ts`, `migrate.ts`,
  `adopt.ts`, `audit.ts`, `privacy-ropa.ts`, `init.ts`
- `packages/data/migrations/platform/0001_roles.sql` …
  `0012_*.sql` (13 files)
- `tools/migration-linter/src/lint.ts`, `types.ts`

### Frontend packages

- `packages-web/{angular,angular-auth,angular-i18n,angular-profile,angular-sessions,angular-storage,angular-tenancy,angular-trash,angular-ui,sdk}/package.json`
- `packages-web/*/src/index.ts` (all 10)

### Reference apps

- `apps/reference-api/src/app.module.ts`
- `apps/reference-api/src/sample/*.controller.ts` (8 files)
- `apps/reference-api/src/sample/reference-sample.service.ts`
- `apps/reference-api/migrations/0001_reference.sql`
- `apps/reference-api/Dockerfile`, `docker-compose.yml`
- `apps/reference-web/src/main.ts`,
  `src/app/app.component.ts`, `app.routes.ts`,
  `core/reference-web-shell.service.ts`

### Infrastructure

- `infra/cdk/lib/{network,data,identity,compute,observability,storage,edge}-stack.ts` (7 files)
- `infra/github/main.tf`

### Audit + governance

- `docs/work/audit/00-EXECUTIVE-SUMMARY.md`
- `docs/work/audit/07-FINDINGS-REGISTER.md`
- `.github/CODEOWNERS`
- `.github/workflows/*.yml` (8 files)
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `config/commitlint.config.cjs`, `.nvmrc`, `.mise.toml`

## Word count

| File                                | Words                              |
| ----------------------------------- | ---------------------------------- |
| `_DISCOVERY.md`                     | ~3 800                             |
| `00-README.md`                      | ~700                               |
| `_GENERATION-PLAN.md`               | ~900                               |
| `01-WHAT-IS-STYNX.md`               | ~750                               |
| `02-IS-STYNX-RIGHT-FOR-YOU.md`      | ~850                               |
| `03-CORE-CONCEPTS.md`               | ~1 800                             |
| `04-INVARIANTS-AND-CONTRACTS.md`    | ~2 200                             |
| `05-PACKAGE-CATALOG.md`             | ~3 000                             |
| `06-DATA-LAYER-PATTERNS.md`         | ~4 080                             |
| `07-AUTH-AND-TENANCY-PATTERNS.md`   | ~3 100                             |
| `08-MIGRATION-PATTERNS.md`          | ~5 270                             |
| `09-FRONTEND-PATTERNS.md`           | ~3 320                             |
| `10-INFRASTRUCTURE-REQUIREMENTS.md` | ~5 130                             |
| `11-PORTING-PLAYBOOK.md`            | ~2 400                             |
| `12-DECISION-TREES.md`              | ~3 570                             |
| `13-COMMON-PITFALLS.md`             | ~4 230                             |
| `14-VERIFICATION-CHECKLIST.md`      | ~1 100                             |
| `15-REFERENCE-EXAMPLES/` (5 files)  | ~9 200                             |
| `16-SPEC-EXCERPTS/` (6 files)       | ~5 800                             |
| `17-AGENT-CONTEXT-PACKAGE.md`       | ~1 800                             |
| `18-GAPS-AND-OPEN-QUESTIONS.md`     | ~1 700                             |
| `99-PROVENANCE.md` (this file)      | ~700                               |
| `_PROMPTS/` (21 prompt files)       | ~7 000                             |
| **TOTAL**                           | **~59 000** (verified via `wc -w`) |

(Range substantially exceeds the 25 000–40 000 target stated in the
original generation brief — the pack is denser than the brief
anticipated. Trim if a tighter version is needed for context
budget.)

## Honesty notes

- **Audit baseline drift:** the pack was generated 4 days after the
  audit at `docs/work/audit/`. Several BLOCKERs and MAJORs from
  that audit have closed since (see
  [`18-GAPS-AND-OPEN-QUESTIONS.md`](18-GAPS-AND-OPEN-QUESTIONS.md)
  cross-reference table). Some surfaces flagged as live in the
  audit may already be resolved; some that the audit flagged as
  resolved may have regressed. Re-verify before relying on either.

- **Read-only Explore-agent constraint:** four of the original
  parallel dispatches (06, 07, 09, 12, 13, 10) were sent to
  `Explore`-type agents that lacked Write access. Their substantive
  research output was visible in the result strings but the file
  writes had to be done either inline (07) or by re-dispatching
  with `general-purpose` agents (06, 09, 12, 10). Files 08 and 13
  came from the second-wave general-purpose dispatches. This
  doubled the dispatch cost but kept the pack honest — content
  with citations rather than hand-written from prior knowledge.

- **Coverage gaps acknowledged:** the pack does not cover
  background-job patterns (G-013), non-Angular frontend full
  integration (G-012), or impersonation (G-015 — explicitly
  unsupported). These are surfaced in
  [`18-GAPS-AND-OPEN-QUESTIONS.md`](18-GAPS-AND-OPEN-QUESTIONS.md).

- **Validation invariant:** every code example in the pack should
  compile against the actual `@stynx/*` exports as documented in
  [`05-PACKAGE-CATALOG.md`](05-PACKAGE-CATALOG.md). Spot-checks
  performed during generation; if a consuming agent finds an
  import that does not resolve, file an issue and treat the
  example as outdated.
