# PORT-11 — Porting Playbook

**Produces:** `docs/stynx/porting-pack/11-PORTING-PLAYBOOK.md`.
**Depends on:** `04` through `10`, `12`, `13`.
**Branch:** `docs/stynx/porting-pack/11-playbook`.

## Mission

The single most important document in the pack. A consuming agent
walks the foreign codebase through this playbook in order. Every
phase has entry criteria, exit criteria, and verification commands.

## Read

- `specs/STYNX-ADOPT-EXAMPLE.md` for prior-art structure.
- `internal work note (not published)` for ordering hints.
- All earlier porting-pack files (cite them, don't restate).

## Structure

```
# 11 — Porting Playbook

## Phase 0 — Assessment

**Goal:** decide whether to port, and produce a written assessment.

**Steps:**
1. Run the structured scan (grep matrix below) on the foreign repo.
2. Apply the compatibility check from `02-IS-STYNX-RIGHT-FOR-YOU.md`.
3. If "DO NOT ADOPT" → stop and report to operators.
4. Otherwise, write `./adoption/ASSESSMENT.md` in the foreign repo
   using the template at the end of this file.

**Scan matrix (grep patterns to run on foreign codebase):**

| Concern | Patterns | Output bucket |
|---|---|---|
| DB access | `pg.Pool`, `new Pool(`, `client\.query`, `prisma\.`, `typeorm`, `knex` | DB |
| Auth middleware | `passport`, `jwt-decode`, `verifyJWT`, `Auth0`, `Clerk` | AUTH |
| Tenancy | `organization`, `org_id`, `tenant`, `account_id`, subdomain parsing | TENANCY |
| Soft delete | `deleted_at`, `is_deleted`, `archived_at` (on live tables) | SOFT-DELETE |
| Permissions | `roles`, `permissions`, `hasRole`, `hasPermission` | PERMS |
| File upload | `multer`, `S3Client`, `getSignedUrl`, `formidable` | STORAGE |
| Background jobs | `bull`, `queue`, `cron`, `setInterval` | BACKGROUND |
| Tests | `Vitest`, `vitest`, `mocha` | TESTS |

**Entry criteria:** foreign repo accessible.
**Exit criteria:** `./adoption/ASSESSMENT.md` exists.
**Effort:** S–M.
**Common blockers:** monorepo with mixed stacks; fork the assessment per package.

## Phase 1 — Foundation

**Goal:** STYNX core, logging, and health booted; app responds on /healthz.

**Steps:** add `@stynx-nyx/core`, `@stynx-nyx/logging`, `@stynx-nyx/health`;
wire `StynxCoreModule.forRoot`; add the structured-error filter.

**Verify:** `curl :PORT/healthz` → 200; logs are JSON.
**Effort:** S.

## Phase 2 — Data Layer

**Goal:** all DB access flows through `@stynx-nyx/data`; tenant-scoped
tables have RLS and archive mirrors.

**Steps:**
1. Add `@stynx-nyx/data`. Run platform migrations.
2. Convert `pg.Pool` / ORM call sites per `06-DATA-LAYER-PATTERNS.md`.
3. For each tenant-scoped table: rename legacy tenant column to
   `tenant_id`, add RLS policy, create archive mirror via helper.
4. Migrate any existing soft-delete data to archive (per pitfall 8).

**Verify:** integration tests pass; `@stynx-nyx/testing` RLS leak
matcher passes.
**Effort:** L–XL.
**Common blockers:** raw-SQL hot paths (pitfall 6); tenant column
inconsistency (pitfall 1).

## Phase 3 — Auth & Tenancy

**Goal:** Cognito-issued JWTs verified; permissions enforced;
TenantContext set on every request.

**Steps:** add `@stynx-nyx/auth`, `@stynx-nyx/tenancy`, `@stynx-nyx/sessions`;
provision Cognito User Pool out-of-band per `10-INFRASTRUCTURE-REQUIREMENTS.md`;
replace existing auth middleware; seed permissions.

**Verify:** login flow end-to-end; @Permission gates routes;
`stynx doctor` reports I4 PASS.
**Effort:** L.
**Common blockers:** JWT claim shape change (pitfall 4); coordinate
with frontend/clients.

## Phase 4 — Audit, Storage, Rate-limit, Idempotency

**Goal:** audit triggers active; ad-hoc S3 replaced; rate limits
and idempotency keys wired.

**Steps:** add the four packages; wire decorators (`@Audit`,
`@RateLimit`, `@Idempotent`); replace ad-hoc storage code.

**Verify:** `stynx doctor` PASS for these surfaces; mutation tests
produce audit rows.
**Effort:** M.

## Phase 5 — Privacy & i18n

**Goal:** PII map populated; LGPD pipeline dry-runs cleanly.

**Steps:** populate PII map; wire i18n catalogs.

**Verify:** `stynx privacy ropa` produces the expected report;
erasure dry-run plans are correct.
**Effort:** M.

## Phase 6 — Frontend (conditional)

**Goal:** depending on the path chosen in `09`, either Angular
adoption or sdk-only integration.

**Effort:** S (sdk-only) … XL (full Angular migration).

## Phase 7 — Green gate

**Goal:** ready to cut over.

**Steps:**
1. Run the verification checklist from `14-VERIFICATION-CHECKLIST.md`.
2. `stynx doctor` exit 0.
3. Address remaining `TODO_PERMISSION` sentinels.
4. Cut over.

**Effort:** S.

## Assessment template

[Embed a markdown template that the consuming agent must use to
produce `./adoption/ASSESSMENT.md`. Sections: project overview,
scan results, compatibility ruling, recommended phasing, blockers,
out-of-scope items, sign-off.]
```

## Rules

- Every phase cites at least one earlier porting-pack file
  (`06`, `07`, `08`, `09`, `10`, `12`, `13`).
- Every "Verify" line is a runnable command, not prose.
- The assessment template is concrete enough that an agent can
  fill it in without further guidance.

## Acceptance

- All eight phases present (0..7).
- Scan matrix has ≥8 rows.
- Assessment template embedded at the end.
- Cross-references to other pack files resolve.
