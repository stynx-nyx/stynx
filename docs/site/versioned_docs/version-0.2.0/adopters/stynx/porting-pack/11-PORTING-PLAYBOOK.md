# 11 — Porting Playbook

The single most important document in the pack. A consuming agent
walks the foreign codebase through this playbook in order. Every
phase has entry criteria, exit criteria, and verification commands.

This playbook references — do not restate — the rest of the pack.
Cross-references are explicit; follow them.

## Phase 0 — Assessment

**Goal:** decide whether to port, and produce
`./adoption/ASSESSMENT.md` in the foreign repo.

**Entry criteria:** access to the foreign repo at HEAD; the pack
under `docs/stynx/porting-pack/`.

**Steps:**

1. **Read** [`01-WHAT-IS-STYNX.md`](01-WHAT-IS-STYNX.md) and
   [`02-IS-STYNX-RIGHT-FOR-YOU.md`](02-IS-STYNX-RIGHT-FOR-YOU.md).
2. **Run the structured scan** below on the foreign codebase.
3. **Apply the compatibility check** from doc 02. If verdict is
   `DO NOT ADOPT`, stop and report.
4. **Write `./adoption/ASSESSMENT.md`** in the foreign repo using
   the template at the end of this file.
5. **Stop and report.** Do not begin Phase 1 until operators
   approve the assessment.

### Scan matrix (run on the foreign codebase)

| Concern         | Patterns to grep                                                                                 | Bucket      |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| DB access       | `pg.Pool`, `new Pool(`, `client\.query`, `prisma\.`, `typeorm`, `knex(`, `sequelize`, `mongoose` | DB          |
| Auth middleware | `passport`, `jwt-decode`, `verifyJWT`, `Auth0`, `Clerk`, `next-auth`                             | AUTH        |
| Tenancy         | `organization`, `org_id`, `tenant`, `account_id`, `workspace_id`, subdomain parsing              | TENANCY     |
| Soft delete     | `deleted_at`, `is_deleted`, `archived_at` on live tables                                         | SOFT-DELETE |
| Permissions     | `roles`, `permissions`, `hasRole`, `hasPermission`, `casbin`, `cancan`                           | PERMS       |
| File upload     | `multer`, `@aws-sdk/client-s3`, `getSignedUrl`, `formidable`, `multipart`                        | STORAGE     |
| Background jobs | `bull`, `bullmq`, `agenda`, `cron`, `setInterval`, `@nestjs/schedule`                            | BACKGROUND  |
| Tests           | `Vitest`, `vitest`, `mocha`, `playwright`, `cypress`                                             | TESTS       |
| Audit           | `audit_log`, `change_log`, `activity_log`                                                        | AUDIT       |
| LGPD/GDPR       | `pii`, `gdpr`, `lgpd`, `data_subject`, `erasure`, `right_to_be_forgotten`                        | LGPD        |

For each bucket, write a short note in `ASSESSMENT.md` describing
the foreign approach and the migration target.

**Exit criteria:** `./adoption/ASSESSMENT.md` exists with all
sections populated. Verdict is PROCEED or SCOPE-REDUCED FIT.
**Effort:** S–M.
**Common blockers:** monorepo with mixed stacks (do separate
assessments per package); ambiguous tenancy (tenant_id is mixed
with sub-tenant ids).

## Phase 1 — Foundation

**Goal:** STYNX core, logging, and health booted; `/healthz` 200.

**Entry criteria:** assessment approved; foreign repo on TypeScript +
NestJS (or migration to NestJS in flight).

**Steps:**

1. Add packages: `@stynx/core`, `@stynx/logging`, `@stynx/health`,
   `@stynx/backend` (composition module — see
   [`05-PACKAGE-CATALOG.md`](05-PACKAGE-CATALOG.md)).
2. In `app.module.ts` import:
   - `StynxCoreModule.forRoot(&#123;...&#125;)`
   - `StynxLoggingModule.forRoot(&#123;...&#125;)`
   - `StynxHealthModule.forRoot(&#123;...&#125;)`
   - `StynxPlatformPipelineModule.forRoot(&#123;...&#125;)` (from
     `@stynx/backend`)
3. Wire the global `StynxErrorFilter` and `RequestContextInterceptor`.
4. Provision Node 24 + pnpm 9.15 + Postgres locally per
   [`10-INFRASTRUCTURE-REQUIREMENTS.md`](10-INFRASTRUCTURE-REQUIREMENTS.md).

**Verify:**

```sh
curl -s http://localhost:3000/healthz | head
# expect: HTTP 200, "ok"
curl -s http://localhost:3000/readyz | head
# expect: HTTP 200, JSON ready report
```

- Logs are JSON-formatted with `request_id`, `tenant_id` (null at
  this stage), `route`, `method`, `status`, `duration_ms`.

**Exit criteria:** app boots; logs structured; health endpoints
return 200; CI runs `pnpm -w typecheck &amp;&amp; pnpm -w lint &amp;&amp; pnpm -w test`.
**Effort:** S.

## Phase 2 — Data Layer

**Goal:** all DB access flows through `@stynx/data`; tenant-scoped
tables have RLS + archive mirrors.

**Entry criteria:** Phase 1 complete; Postgres available.

**Steps:**

1. Add `@stynx/data` and run platform migrations:
   ```sh
   node packages/cli/dist/main.js migrate up
   ```
2. Convert `pg.Pool` and ORM call sites per
   [`06-DATA-LAYER-PATTERNS.md`](06-DATA-LAYER-PATTERNS.md) Patterns
   1–8.
3. For each tenant-scoped table:
   - Rename legacy tenant column to `tenant_id`.
   - Enable RLS + create `tenant_isolation` policy.
   - If the table is soft-deletable, recreate it with
     `data.create_soft_deletable_table($$ ... $$)` (atomic mirror +
     RLS + indexes + audit).
4. For each FK to a soft-deletable parent, add a
   `-- @softdelete_fk: hide | cascade | block` annotation. Use
   [`12-DECISION-TREES.md`](12-DECISION-TREES.md) Tree 1 to choose.
5. Migrate any existing soft-delete data (rows with `deleted_at`)
   into archive at cutover (see
   [`13-COMMON-PITFALLS.md`](13-COMMON-PITFALLS.md) pitfall 8).
6. Delete every `WHERE tenant_id = $X` predicate from app code —
   RLS handles it now.
7. Run the migration linter:
   ```sh
   pnpm --filter @stynx/migration-linter exec migration-linter \
     apps/<your-app>/migrations
   ```

**Verify:**

- Integration tests pass.
- `expectRlsLeakageDetection` matcher from `@stynx/testing`
  reports no leaks.
- Migration linter exits 0 (caveat: audit FIND-004 — re-verify
  upstream).
- Doctor (Phase 7) reports I5/I8 PASS.

**Exit criteria:** RLS enforced; archive mirrors created; manual
tenant predicates removed; linter green.
**Effort:** L–XL (largest phase).
**Common blockers:** raw-SQL hot paths that don't translate to
Drizzle (pitfall 6); `org_id` not 1:1 with tenant (pitfall 1);
backfilling `updated_at` / `updated_by` on legacy tables
(pitfall 3).

## Phase 3 — Auth &amp; Tenancy

**Goal:** Cognito-issued JWTs verified; permissions enforced;
TenantContext set on every request.

**Entry criteria:** Phase 2 complete; Cognito User Pool provisioned
per [`10`](10-INFRASTRUCTURE-REQUIREMENTS.md) (out of band).

**Steps:**

1. Add `@stynx/auth`, `@stynx/tenancy`, `@stynx/sessions`.
2. Wire modules in `app.module.ts` per
   [`07-AUTH-AND-TENANCY-PATTERNS.md`](07-AUTH-AND-TENANCY-PATTERNS.md)
   Pattern A.
3. Replace existing auth middleware. **Coordinate with frontend
   and external clients on JWT claim shape change** (pitfall 4).
4. Define permissions and seed them in a migration
   ([`08-MIGRATION-PATTERNS.md`](08-MIGRATION-PATTERNS.md) Pattern:
   permission seeds).
5. Add `@Permission(...)` to every controller method (replace
   `TODO_PERMISSION` sentinels at the end).
6. Wire `StynxTenancyModule` — `TenantContextInterceptor` registers
   globally and sets the GUC per request.
7. Migrate Cognito user import via `stynx adopt link-cognito-users`
   (operational, not a codemod — see pitfall 7).

**Verify:**

- Login flow end-to-end: SPA → Cognito → `POST /sessions` → STYNX
  bearer → request with `X-Tenant-Id` → 200.
- Removing `@Permission` from a route causes `pnpm doctor` to fail.
- A request without `X-Tenant-Id` and no claim resolves cleanly
  (or fails with the documented error if tenancy is mandatory).

**Exit criteria:** all routes guarded; Cognito import complete;
sessions stored in Redis + DB.
**Effort:** L.
**Common blockers:** JWT claim shape (pitfall 4); Cognito import
throttling.

## Phase 4 — Audit, Storage, Rate-limit, Idempotency

**Goal:** the four cross-cutting modules wired; `@stynx/storage`
replaces ad-hoc S3 code.

**Entry criteria:** Phase 3 complete.

**Steps:**

1. Add `@stynx/audit`, `@stynx/storage`, `@stynx/ratelimit`,
   `@stynx/idempotency`. Wire in `app.module.ts`.
2. Decorate routes:
   - Every mutation gets `@Audit(&#123; action, entity &#125;)` or
     `@NoAudit('reason')` (I6).
   - User-driven retryable mutations get
     `@Idempotent('Idempotency-Key')`.
   - Public/expensive routes get `@RateLimit(&#123; bucket, scope, cost &#125;)`.
3. Replace ad-hoc S3 code (`@aws-sdk/client-s3` direct usage) with
   `@stynx/storage`'s `ObjectStoreService` and `DocumentsService`
   (I3).

**Verify:**

- Mutation tests show audit rows (`audit.log`) written.
- Idempotency replay returns cached response.
- Rate-limit on a fixed scope returns 429 after the budget.
- `pnpm doctor` reports I3 / I4 / I6 / I7 PASS.

**Exit criteria:** all four decorators applied where appropriate;
no `@aws-sdk/client-s3` outside `packages/storage/`.
**Effort:** M.

## Phase 5 — Privacy &amp; i18n

**Goal:** PII map populated; LGPD pipeline dry-runs cleanly;
i18n catalogs wired.

**Entry criteria:** Phase 4 complete.

**Steps:**

1. Add `@stynx/privacy`, `@stynx/i18n`.
2. Populate `core.pii_map` for every PII column. Use
   [`12-DECISION-TREES.md`](12-DECISION-TREES.md) Tree 6 to pick
   strategies.
3. Wire i18n catalogs (`pt-BR`, `en-US` only — spec §23).
4. Run an erasure dry-run:
   ```sh
   node packages/cli/dist/main.js privacy ropa
   ```

**Verify:**

- `stynx privacy ropa` produces a per-table strategy list matching
  the PII map.
- Erasure dry-run plan touches both live and archive.
- `lgpd_erasure_total&#123;table, strategy&#125;` metric increments on a
  smoke-test erasure.

**Exit criteria:** PII map covers every PII column; LGPD pipeline
green for dry-run.
**Effort:** M.

## Phase 6 — Frontend (conditional)

**Goal:** depending on the path chosen in
[`09-FRONTEND-PATTERNS.md`](09-FRONTEND-PATTERNS.md), either
Angular adoption or `@stynx-web/sdk` integration.

**Steps:** see doc 09.

**Verify:**

- Login → tenant resolution → resource flow end-to-end.
- Errors surface with `&#123; code, httpStatus, message, details &#125;`
  shape.
- `*hasPermission` directive (Angular) or equivalent (SDK
  consumer) hides UI for missing permissions.

**Effort:** S (sdk-only) … XL (full Angular migration).

## Phase 7 — Green gate

**Goal:** ready to cut over.

**Steps:**

1. Run [`14-VERIFICATION-CHECKLIST.md`](14-VERIFICATION-CHECKLIST.md)
   end-to-end. Every box checked.
2. `pnpm doctor` exits 0 with non-empty output.
3. No `TODO_PERMISSION` / `TODO_AUDIT` / `TODO_TENANCY` strings
   remain.
4. CI green; CODEOWNERS in place; branch protection enforced.

**Exit criteria:** all of the above.
**Effort:** S–M.

## Assessment template

Place at `./adoption/ASSESSMENT.md` in the foreign repo.

```markdown
# STYNX Adoption Assessment — <foreign-app-name>

## Project overview

<1–2 paragraph description of the foreign application>

## Scan results

### DB access

<observed pattern, file:line samples>

### Auth middleware

<observed pattern>

### Tenancy

<observed pattern; is `org_id` 1:1 with STYNX tenant? See pitfall 1>

### Soft delete

<observed pattern>

### Permissions

<observed pattern>

### File upload

<observed pattern>

### Background jobs

<observed pattern>

### Tests

<observed pattern>

### Audit

<observed pattern>

### LGPD/GDPR

<observed pattern>

## Compatibility check (10 questions)

| #   | Q                      | Yes/No | Note |
| --- | ---------------------- | ------ | ---- |
| 1   | TS or migratable?      |        |      |
| 2   | NestJS or replaceable? |        |      |
| 3   | Postgres?              |        |      |
| 4   | AWS or migratable?     |        |      |
| 5   | Tenant-as-column?      |        |      |
| 6   | Cognito-willing?       |        |      |
| 7   | `deleted_at` legacy?   |        |      |
| 8   | Angular or sdk?        |        |      |
| 9   | Strict CI gates?       |        |      |
| 10  | LGPD/GDPR need?        |        |      |

## Verdict

PROCEED | SCOPE-REDUCED FIT | DO NOT ADOPT

## Recommended phasing

Phase 0: <complete>
Phase 1: <S/M/L/XL>
Phase 2: <S/M/L/XL>
Phase 3: <S/M/L/XL>
Phase 4: <S/M/L/XL>
Phase 5: <S/M/L/XL>
Phase 6: <S/M/L/XL or N/A>
Phase 7: <S/M/L/XL>

## Blockers

- <list>

## Out-of-scope items

- <list anything explicitly deferred>

## Sign-off

- [ ] Operator approval to proceed beyond Phase 0.
```
