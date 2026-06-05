# 17 — Agent Context Package

A compact, structured context blob optimized for pasting directly
into a downstream LLM agent's system prompt. The operator copies
this single document into a fresh chat and the receiving agent has
enough grounding to start.

&gt; **Use this for:** initial agent grounding when starting a port.
&gt; **Do not use this for:** the actual playbook — that's
&gt; [`11-PORTING-PLAYBOOK.md`](11-PORTING-PLAYBOOK.md).

---

## Mission statement (paste into your system prompt)

You are porting **&lt;FOREIGN APP NAME&gt;** at `&lt;PATH&gt;` onto STYNX.

STYNX is a multi-tenant TypeScript/NestJS platform foundation. It
provides identity, multi-tenancy, audit, soft-delete-via-archive,
RLS, LGPD pipelines, storage, idempotency, rate-limiting, and i18n
as a set of `@stynx/*` (backend) and `@stynx-web/*` (frontend)
packages. The architecture is opinionated and enforces eight
non-negotiable invariants (I1–I8). Your job is to migrate the
foreign codebase onto this foundation while preserving its product
behavior.

You have access to the STYNX Porting Pack at `docs/stynx/porting-pack/`.
Treat it as authoritative. Do not invent STYNX features; if the
pack does not cover something, say so explicitly and stop for
guidance.

## The ten most critical facts about STYNX

1. **Pool + RLS multi-tenancy.** One DB, one Cognito pool, one S3
   bucket per environment. All tenants share. Per-tenant S3 prefix.
   No schema-per-tenant; no DB-per-tenant.
2. **Three database roles** — `stynx_owner` (BYPASSRLS, DDL),
   `stynx_app` (subject to RLS, DML), `stynx_reader` (subject to
   RLS, SELECT only). Routes pick the role via `Database.tx`
   options or the `@ReadOnly()` decorator.
3. **No `deleted_at` on live tables — ever.** Soft-delete moves
   the row to `archive.&#123;schema&#125;_&#123;table&#125;`. Use
   `data.create_soft_deletable_table($$ ... $$)` to author tables.
4. **Every route has a permission.** Add `@Permission('...')`,
   `@Public()`, or `@System()` to every controller method, or CI
   fails (I4).
5. **Every mutation is audited.** Add `@Audit(&#123; entity, op &#125;)` or
   `@NoAudit('reason')`. Triggers on opted-in tables write to
   `audit.log`. The `app.archive_move` GUC suppresses duplicate
   audit rows during archive moves.
6. **Cognito is IdP only.** Tenancy and roles live in STYNX DB
   (`tenancy.tenants`, `auth.memberships`, `auth.role_perms`). Do
   not use Cognito Groups for tenancy.
7. **All DB access goes through `Database.tx`** from `@stynx/data`.
   Direct `pg.Pool` outside `@stynx/data` is invariant violation
   I1. Background work wraps in `withSystemContext('reason', fn)`
   for I2.
8. **All S3 access goes through `@stynx/storage`.** Direct
   `@aws-sdk/client-s3` outside that package is invariant
   violation I3.
9. **FK to a soft-deletable parent must be annotated.** Use
   `-- @softdelete_fk: cascade | block | hide`. The migration
   linter rejects missing annotations (LINT004).
10. **i18n is `pt-BR` and `en-US` only** (v1.0). LGPD pipelines
    process both live and archive on demand; PII map drives the
    erasure strategy per column.

## The phases of the port (one paragraph each)

**Phase 0 — Assessment.** Scan the foreign repo for DB access,
auth, tenancy, soft-delete, permissions, storage, jobs, tests,
audit, and LGPD patterns. Apply the 10-question compatibility check
from `02-IS-STYNX-RIGHT-FOR-YOU.md`. Produce
`./adoption/ASSESSMENT.md` and stop for operator approval.

**Phase 1 — Foundation.** Add `@stynx/core`, `@stynx/logging`,
`@stynx/health`, `@stynx/backend`. App boots; `/healthz` 200; logs
are structured JSON. Effort: S.

**Phase 2 — Data layer.** Add `@stynx/data`. Run platform
migrations. Convert every `pg.Pool` and ORM call site to
`Database.tx`. Rename `org_id` → `tenant_id` (where 1:1), enable
RLS + tenant_isolation policies, replace soft-delete with archive
mirrors via `data.create_soft_deletable_table`. Annotate every FK
to a soft-deletable parent. Delete manual `WHERE tenant_id = $X`
predicates. Effort: L–XL (largest phase).

**Phase 3 — Auth &amp; tenancy.** Add `@stynx/auth`, `@stynx/tenancy`,
`@stynx/sessions`. Provision Cognito User Pool out-of-band.
Replace existing auth middleware. Seed permissions in a migration.
Add `@Permission(...)` to every controller method. Wire
`TenantContextInterceptor`. Coordinate JWT claim-shape change with
clients. Effort: L.

**Phase 4 — Audit, storage, rate-limit, idempotency.** Add the
four packages. Decorate mutations with `@Audit`. Decorate
user-driven retryable mutations with `@Idempotent`. Decorate
public/expensive routes with `@RateLimit`. Replace `@aws-sdk/client-s3`
direct usage with `@stynx/storage`. Effort: M.

**Phase 5 — Privacy &amp; i18n.** Add `@stynx/privacy`, `@stynx/i18n`.
Populate `core.pii_map`. Wire pt-BR + en-US catalogs. Run a
`stynx privacy ropa` dry-run and verify the plan. Effort: M.

**Phase 6 — Frontend (conditional).** Angular: adopt
`@stynx-web/angular`, `@stynx-web/angular-auth`, `@stynx-web/angular-tenancy`,
plus the per-feature angular-\* packages. Non-Angular: use
`@stynx-web/sdk` (framework-agnostic). Effort: S to XL.

**Phase 7 — Green gate.** Run `14-VERIFICATION-CHECKLIST.md`.
`pnpm doctor` exits 0. No `TODO_PERMISSION` sentinels. CI green.
Effort: S–M.

## Common pitfalls (one line each)

1. `organization_id` is not always `tenant_id` — verify granularity
   before renaming.
2. Ad-hoc `deleted_at` on live tables must be migrated to archive
   at cutover, not ported.
3. Missing `updated_at` / `updated_by` on legacy tables breaks the
   soft-delete helper — backfill first.
4. JWT claim shape changes break clients — coordinate.
5. Default `block` FKs surface user-facing 409s — choose `cascade`
   or `hide` where the lifecycle is compositional or informational.
6. Complex JOIN/LATERAL/window-function SQL needs manual rewrite to
   Drizzle.
7. Cognito user-import is an operational runbook, not a codemod.
8. RLS policy drift between live and archive is a common silent
   leak source — let the helper generate both.
9. `withSystemContext` bypasses tenant scope, **not** audit. The
   `reason` string is recorded in `audit.system_op` (5-year hot
   retention).
10. Bypassing `@stynx/data` for archive moves leaves
    `app.archive_move` unset → duplicate audit rows.

## Where to look in the pack for more detail

| Topic                    | File                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Invariants and detection | [`04-INVARIANTS-AND-CONTRACTS.md`](04-INVARIANTS-AND-CONTRACTS.md)                                       |
| Package surface          | [`05-PACKAGE-CATALOG.md`](05-PACKAGE-CATALOG.md)                                                         |
| Data patterns            | [`06-DATA-LAYER-PATTERNS.md`](06-DATA-LAYER-PATTERNS.md)                                                 |
| Auth + tenancy           | [`07-AUTH-AND-TENANCY-PATTERNS.md`](07-AUTH-AND-TENANCY-PATTERNS.md)                                     |
| Migrations               | [`08-MIGRATION-PATTERNS.md`](08-MIGRATION-PATTERNS.md)                                                   |
| Frontend                 | [`09-FRONTEND-PATTERNS.md`](09-FRONTEND-PATTERNS.md)                                                     |
| Infrastructure           | [`10-INFRASTRUCTURE-REQUIREMENTS.md`](10-INFRASTRUCTURE-REQUIREMENTS.md)                                 |
| Playbook                 | [`11-PORTING-PLAYBOOK.md`](11-PORTING-PLAYBOOK.md)                                                       |
| Decision trees           | [`12-DECISION-TREES.md`](12-DECISION-TREES.md)                                                           |
| Pitfalls                 | [`13-COMMON-PITFALLS.md`](13-COMMON-PITFALLS.md)                                                         |
| Verification             | [`14-VERIFICATION-CHECKLIST.md`](14-VERIFICATION-CHECKLIST.md)                                           |
| Reference examples       | [`15-REFERENCE-EXAMPLES/full-feature-walkthrough.md`](15-REFERENCE-EXAMPLES/full-feature-walkthrough.md) |
| Spec excerpts            | [`16-SPEC-EXCERPTS/invariants.md`](16-SPEC-EXCERPTS/invariants.md)                                       |
| Known gaps               | [`18-GAPS-AND-OPEN-QUESTIONS.md`](18-GAPS-AND-OPEN-QUESTIONS.md)                                         |

## Canonical opening prompt (paste into the agent's first turn)

&gt; You have access to the STYNX Porting Pack at `docs/stynx/porting-pack/`.
&gt; You are porting `&lt;FOREIGN APP&gt;` at `&lt;PATH&gt;` onto STYNX.
&gt;
&gt; **Step 1.** Read `00-README.md`, then
&gt; `02-IS-STYNX-RIGHT-FOR-YOU.md`, then
&gt; `11-PORTING-PLAYBOOK.md` Phase 0.
&gt;
&gt; **Step 2.** Scan `&lt;FOREIGN APP&gt;` using the matrix in Phase 0.
&gt; Produce `./adoption/ASSESSMENT.md` using the template at the end
&gt; of `11-PORTING-PLAYBOOK.md`.
&gt;
&gt; **Step 3.** Stop and report. Do not begin Phase 1 until I approve
&gt; the assessment.
&gt;
&gt; Do not invent STYNX features. If the pack does not cover
&gt; something you need, say so explicitly. Cite the pack file and
&gt; section for every architectural decision you make.

## Output format hints

- Always produce `./adoption/ASSESSMENT.md` before any code.
- All STYNX migrations go in `./migrations/` and follow
  `NNNN_description.sql` naming.
- All `@stynx/*` imports use barrel paths only (no deep imports).
- Every controller method must carry `@Permission`, `@Public`, or
  `@System`.
- Every mutation method must carry `@Audit` or `@NoAudit('reason')`.
- Every FK to a soft-deletable parent must carry
  `-- @softdelete_fk: hide | cascade | block`.
- Every soft-deletable table must be authored via
  `data.create_soft_deletable_table($$ ... $$)`.
- Read `13-COMMON-PITFALLS.md` before doing anything irreversible
  (cutover migrations, JWT claim changes, Cognito user import).

## What to do when stuck

If a foreign-codebase pattern doesn't map to STYNX:

1. Re-read [`12-DECISION-TREES.md`](12-DECISION-TREES.md) — chances
   are there's a tree for it.
2. Check [`18-GAPS-AND-OPEN-QUESTIONS.md`](18-GAPS-AND-OPEN-QUESTIONS.md)
   — your situation may be a known gap.
3. Mark the issue in `./adoption/ASSESSMENT.md` as a blocker and
   stop. Do not invent a STYNX feature to fit.
