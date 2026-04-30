# 13 — Common Pitfalls

> **Purpose.** Catalogue the recurring failure modes seen when porting
> a raw-SQL/NestJS service onto STYNX, plus a handful that are not yet
> empirically observed but are predictable from the audit-model and
> soft-delete-model invariants. Every entry is grounded in a citation.
>
> **How to use.** Before opening a PR for any phase of the adoption,
> run each pitfall's "Detection" command. If it yields hits, walk
> through the matching "Fix" before pushing.
>
> **Source baseline.**
>
> - `porting-pack/_DISCOVERY.md` (commit `670d165`, 2026-04-27)
> - `porting-pack/16-SPEC-EXCERPTS/audit-model.md`
> - `porting-pack/16-SPEC-EXCERPTS/soft-delete-model.md`
> - `specs/STYNX-ADOPT-EXAMPLE.md` §6 ("Common gotchas")
> - `docs/work/audit/07-FINDINGS-REGISTER.md`

---

## Index

| #   | Pitfall                                                     | Severity |
| --- | ----------------------------------------------------------- | -------- |
| 1   | `organization_id` is not always `tenant_id`                 | High     |
| 2   | Ad-hoc `deleted_at` polluting archive at cutover            | High     |
| 3   | Missing `updated_at` / `updated_by` on legacy tables        | Medium   |
| 4   | JWT claim shape change                                      | High     |
| 5   | Default `block` FK annotation surfacing 409s                | Medium   |
| 6   | Raw SQL with complex joins not auto-converting to Drizzle   | Medium   |
| 7   | Cognito user-import is NOT a codemod                        | High     |
| 8   | Migrating data from existing soft-delete to archive         | High     |
| 9   | RLS policy drift between live and archive mirrors           | High     |
| 10  | `withSystemContext` treated as a free pass                  | High     |
| 11  | GUC suppression bypassed for archive moves                  | High     |
| 12  | Permission seeding order — perms before role_permissions FK | Medium   |
| 13  | `is_active` vs soft-delete confusion                        | Medium   |

---

### `organization_id` is not always `tenant_id` — semantic mis-rename

- **Symptom:** After `stynx adopt apply`, a subset of rows become
  invisible under the new RLS policies. End users report "I had 14
  records, now I have 3." Some legacy `organization_id` values do not
  exist in `tenancy.tenants`, and the FK constraint added by the
  codemod fails for those rows during the rename migration.
- **Root cause:** `organization_id` is overloaded in many legacy
  schemas. Per `STYNX-ADOPT-EXAMPLE.md` §6 #1, "some apps use
  `organization_id` for a user-facing grouping concept rather than
  actual SaaS tenancy." A blanket rename plus FK to
  `tenancy.tenants(id)` corrupts both meanings, and **I5** then
  filters on the new column, hiding rows whose old value was a UI
  grouping.
- **Fix:** Triage the column **before** running `stynx adopt apply`.
  Two correct outcomes:
  1. The column truly was tenancy → rename and FK as the codemod
     does. Confirm by joining against `tenancy.tenants`:

     ```sql
     SELECT DISTINCT r.organization_id
     FROM   resource_record r
     LEFT JOIN tenancy.tenants t ON t.id = r.organization_id
     WHERE  t.id IS NULL;
     -- expected: zero rows. Any rows = STOP, do triage.
     ```

  2. The column was a UI grouping → keep it (or rename to
     `group_id`) and add a _separate_ `tenant_id` populated from the
     request context. Override the codemod with `stynx adopt apply
--skip-rename resource_record.organization_id` and add by hand:

     ```sql
     ALTER TABLE resource_record
       ADD COLUMN tenant_id uuid NOT NULL
         REFERENCES tenancy.tenants(id)
         DEFAULT current_setting('app.tenant_id', true)::uuid;
     ```

- **Detection:**

  ```bash
  rg -n --type sql 'organization_id' migrations/ apps/
  rg -n 'RENAME COLUMN organization_id TO tenant_id' migrations/
  psql "$LEGACY_URL" -f scripts/probe-org-vs-tenant.sql
  ```

- **Citation:** `specs/STYNX-ADOPT-EXAMPLE.md` §6 #1; invariant **I5**
  in `_DISCOVERY.md` §3.

---

### Ad-hoc `deleted_at` on live tables polluting archive at cutover

- **Symptom:** After cutover, the archive mirror contains "tombstone"
  rows that were never genuinely deleted — drafts, test records,
  abandoned wizard rows. Trash UIs (`GET /things/_trash`) display
  decade-old drafts; legitimate archived rows are mixed with noise.
- **Root cause:** Per **I8** (`_DISCOVERY.md` §3): "Live tables of
  soft-deletable entities do **not** carry `deleted_at`/`deleted_by`
  columns — deletion metadata lives in the archive mirror only."
  Legacy schemas commonly carry `deleted boolean DEFAULT false` plus
  `deleted_at timestamptz` (see `STYNX-ADOPT-EXAMPLE.md` §1.4). The
  adopt codemod's default behavior is to backfill every `deleted =
true` row into archive at the `data.adopt_soft_deletable_table`
  step. Without triage, that migration carries forward years of noise.
- **Fix:** Treat the cutover as a two-phase data move. Triage every
  `deleted = true` row before invoking the helper:

  ```sql
  -- triage.sql (run before stynx adopt apply --confirm)
  CREATE TEMP TABLE _triage AS
  SELECT id,
    CASE
      WHEN deleted_at < now() - interval '5 years' THEN 'hard_delete'
      WHEN external_ref LIKE 'TEST-%'             THEN 'hard_delete'
      WHEN status = 'draft'
       AND created_at < now() - interval '30 days' THEN 'hard_delete'
      ELSE                                              'archive'
    END AS disposition
  FROM resource_record WHERE deleted = true;

  DELETE FROM resource_record
   WHERE id IN (SELECT id FROM _triage WHERE disposition = 'hard_delete');

  SELECT data.adopt_soft_deletable_table(
    live_table         => 'resource_record',
    soft_delete_column => 'deleted',
    deleted_at_column  => 'deleted_at',
    deleted_by_column  => NULL
  );
  ```

- **Detection:**

  ```bash
  rg -n --type sql '^\s*deleted\s+boolean' migrations/
  for f in $(rg -l 'data\.adopt_soft_deletable_table' migrations/); do
    grep -q 'DELETE FROM' "$f" || echo "MISSING TRIAGE: $f"
  done
  psql "$STAGING_URL" -c "SELECT count(*) FROM archive.resource_record
                          WHERE created_at < now() - interval '5 years';"
  ```

- **Citation:** `STYNX-ADOPT-EXAMPLE.md` §6 #2 and worked migration
  in §3.4; **I8** in `_DISCOVERY.md` §3.

---

### Missing `updated_at` / `updated_by` on legacy tables

- **Symptom:** The migration fails with `column "updated_by"...
contains null values` when the codemod runs `ALTER COLUMN
updated_by SET NOT NULL`, or — worse — succeeds silently with
  `updated_by = created_by` for every historical row, fabricating
  audit history. Reports of "who last touched X" lie.
- **Root cause:** `data.create_soft_deletable_table` and the archive
  mirror (`soft-delete-model.md` §14.2) require `created_at`,
  `created_by`, `updated_at`, `updated_by` on every tenant-scoped
  table. Many legacy schemas only carry `created_at` / `created_by`.
  The codemod synthesizes safe defaults (`STYNX-ADOPT-EXAMPLE.md`
  §3.4 lines 313–317), but defaults are _not_ historical truth.
- **Fix:** Decide explicitly per table:
  1. Accept the default fabrication and document it in the migration
     header.
  2. Backfill from a sister log table:

     ```sql
     UPDATE resource_record r
        SET updated_at = h.last_change_at,
            updated_by = h.last_change_by
       FROM (
         SELECT record_id, max(changed_at) AS last_change_at,
                (array_agg(changed_by ORDER BY changed_at DESC))[1]
                                              AS last_change_by
         FROM   resource_record_history
         GROUP  BY record_id
       ) h
      WHERE r.id = h.record_id;
     ```

  3. Mark as platform-synthesized with a sentinel UUID
     (`00000000-0000-0000-0000-000000000000`) and a tag.

- **Detection:**

  ```bash
  psql "$LEGACY_URL" -At <<'SQL'
    SELECT table_schema, table_name FROM information_schema.columns
    WHERE  column_name = 'created_at'
    EXCEPT
    SELECT table_schema, table_name FROM information_schema.columns
    WHERE  column_name = 'updated_at';
  SQL
  psql "$STAGING_URL" -c "SELECT count(*) FROM resource_record
     WHERE updated_at = created_at AND updated_by = created_by;"
  ```

- **Citation:** `STYNX-ADOPT-EXAMPLE.md` §6 #3 and §3.4 lines 313–317;
  `soft-delete-model.md` §14.2.

---

### JWT claim shape change

- **Symptom:** After cutover, every authenticated request returns 401
  Unauthorized, or — subtler — requests succeed but every query
  returns zero rows because `app.tenant_id` is `NULL`. Logs show
  `TenantContextMissingError` from `@stynx/data` (`_DISCOVERY.md`
  §10).
- **Root cause:** Legacy JWT shape (`STYNX-ADOPT-EXAMPLE.md` §1.2) is
  typically `{ sub, email, org_id }`. STYNX's `@stynx/auth` expects
  `{ sub, sid, tenant_id, perms_hash }` (per §6 #4). The middleware
  swap deletes the legacy middleware but does not migrate
  already-issued tokens.
- **Fix:** Three-step rollout — _not_ a single big bang.
  1. **Dual-issue** old + new tokens during the shadow period.
  2. **Token-shape adapter** until every active token has rotated:

     ```typescript
     // src/auth/legacy-claim-shim.middleware.ts
     @Injectable()
     export class LegacyClaimShim implements NestMiddleware {
       use(req: any, _res: any, next: () => void) {
         const h = req.headers.authorization;
         if (h?.startsWith('Bearer ')) {
           const payload = decode(h.slice(7)) as any;
           if (payload?.org_id && !payload?.tenant_id) {
             payload.tenant_id = payload.org_id;
             payload.sid = payload.sid ?? payload.jti;
             req.headers['x-stynx-legacy-claim'] = '1';
           }
         }
         next();
       }
     }
     ```

  3. **Hard-fail after TTL** via metric `auth_legacy_claim_total`.

- **Detection:**

  ```bash
  rg -n "payload\.org_id|claims?\.org_id|jwt.*org_id" apps/ packages/
  rg -n "'org_id'" apps/reference-api/src/ \
    && echo "FAIL: legacy claim leaked into new code"
  curl -s -H "Authorization: Bearer $LEGACY_TOKEN" \
       https://api.example/things | jq '.code'
  ```

- **Citation:** `STYNX-ADOPT-EXAMPLE.md` §6 #4 and §1.2 / §3.2;
  `_DISCOVERY.md` §10 (`TenantContextMissingError`).

---

### Default `block` FK annotation surfacing user-facing 409s

- **Symptom:** Users hit `409 Conflict` with code
  `SOFT_DELETE_BLOCKED_BY_CHILDREN` when deleting records they
  expect to delete (and child rows that should delete with them).
  409 dashboard spike on the day the new permission model lands.
- **Root cause:** Per `soft-delete-model.md` §14.7, every FK to a
  soft-deletable parent must carry `hide`, `cascade`, or `block`. The
  linter rejects unannotated FKs, and `stynx adopt apply` proposes
  `block` when uncertain (`STYNX-ADOPT-EXAMPLE.md` §4) because it is
  safest _for data integrity_ — but it is the **least safe for UX**.
  `block` translates to `ON DELETE RESTRICT` plus a runtime 409. For
  composition relationships (line items, sub-records, attachments)
  the correct annotation is `cascade`.
- **Fix:** Treat every `block` annotation as a deliberate UX choice.
  Walk the FK list before merging.

  ```sql
  -- BAD (codemod default for an attachment-style table):
  CREATE TABLE related_document (
    resource_record_id uuid NOT NULL REFERENCES resource_record(id)
      ON DELETE RESTRICT,
    -- @softdelete_fk: block
    ...);

  -- GOOD (composition; cascade after review):
  CREATE TABLE related_document (
    resource_record_id uuid NOT NULL REFERENCES resource_record(id)
      ON DELETE CASCADE,
    -- @softdelete_fk: cascade
    ...);
  ```

  Mapping rubric: independent lifecycle → `block`; compositional →
  `cascade`; long-lived references where parent disappearance should
  hide but not delete → `hide`.

- **Detection:**

  ```bash
  rg -n -- '@softdelete_fk:' migrations/ apps/
  rg -o -- '@softdelete_fk:\s+\w+' migrations/ apps/ | sort | uniq -c
  pnpm --filter @stynx/data test --testPathPattern 'cascade.*\.spec\.ts'
  ```

- **Citation:** `soft-delete-model.md` §14.7; `STYNX-ADOPT-EXAMPLE.md`
  §6 #5 and §4 "FK ANNOTATIONS" mapping.

---

### Raw SQL with complex joins not surviving auto-conversion to Drizzle

- **Symptom:** `stynx adopt apply` finishes "successfully" but a
  smattering of `sql\`...\``blocks remain. CI typecheck passes
because raw`sql` blocks don't constrain return types; runtime
  silently returns differently-shaped rows. Bugs surface only when a
  downstream consumer of the JSON response trips on a missing field.
- **Root cause:** Per `STYNX-ADOPT-EXAMPLE.md` §6 #6, "Complex raw
  SQL may stay raw. `stynx adopt apply` preserves untranslatable
  queries as `sql\`...\``blocks when necessary." The codemod cannot
reliably rewrite recursive CTEs, lateral joins, multi-row`RETURNING`with`ON CONFLICT`, custom-aggregate calls, or any
  PG-specific syntax Drizzle hasn't modeled.
- **Fix:** Two-step.
  1. **Rewrite by hand into Drizzle** wherever its SQL builder
     genuinely supports the shape. Pair with a Vitest test that
     locks the row shape.
  2. **For irreducible raw SQL**, wrap in a typed adapter:

     ```typescript
     import { sql } from 'drizzle-orm';
     import { z } from 'zod';

     const RowSchema = z.object({
       id: z.string().uuid(),
       opened_at: z.date(),
       child_count: z.number().int(),
     });

     async function listWithCounts(trx: Transaction) {
       const result = await trx.execute(sql`
         WITH RECURSIVE chain AS ( ... )
         SELECT r.id, r.opened_at, count(c.*) AS child_count
         FROM   resource_record r
         LEFT JOIN chain c ON c.root_id = r.id
         GROUP  BY r.id;
       `);
       return RowSchema.array().parse(result.rows);
     }
     ```

     The Zod parse converts shape mismatches into loud test
     failures. The `sql` template still goes through `Transaction`,
     so I1 and the GUCs are preserved.

- **Detection:**

  ```bash
  rg -n --type ts 'sql`' apps/ packages/ --glob '!**/dist/**'
  rg -nU --type ts -A 30 'sql`' apps/ \
    | rg -B 30 'return result' \
    | rg -L '\.(parse|safeParse)\('
  ```

- **Citation:** `STYNX-ADOPT-EXAMPLE.md` §6 #6; `_DISCOVERY.md` §10
  (`Transaction`, `createDrizzle`).

---

### Cognito user-import is NOT a codemod (operational runbook)

- **Symptom:** The adoption PR merges; CI is green. On rollout,
  _every_ user fails to log in. Engineers grep for the bug, find
  none, and discover hours later that there are zero users in the
  configured Cognito User Pool.
- **Root cause:** Per `STYNX-ADOPT-EXAMPLE.md` §6 #7, "Cognito
  migration is not a codemod. The helper links identities; it does
  not provision Cognito users for you." `stynx adopt
link-cognito-users` (`_DISCOVERY.md` §8) writes the Cognito-sub ↔
  legacy-user mapping into `auth.user_identities`. It assumes
  Cognito users _already exist_. Provisioning them from the legacy
  user table is a separate operational step (CSV import,
  AdminCreateUser, custom Lambda) — out-of-scope for the codemod.
- **Fix:** Treat Cognito provisioning as a Phase-3 runbook entry,
  not Phase 2:
  1. **Export** legacy users to CSV with the columns Cognito's bulk
     import expects (`cognito:username`, `email`, `email_verified`,
     custom attributes).
  2. **Import** via `aws cognito-idp create-user-import-job`;
     monitor the CloudWatch log group. Plan for a non-zero failure
     rate (invalid emails, lowercased duplicates).
  3. **Force password reset** — Cognito imports cannot carry
     password hashes from arbitrary legacy schemes.
  4. **Run `stynx adopt link-cognito-users --dry-run`** first; it
     reports legacy users for whom no Cognito sub was found.
  5. Only then run `--apply` to write `auth.user_identities`.

  Document this in `docs/operations/runbooks/cognito-cutover.md`
  (helps close FIND-031).

- **Detection:**

  ```bash
  aws cognito-idp list-users --user-pool-id "$POOL_ID" \
      --query 'Users[].Username' --output json | jq 'length'
  pnpm stynx adopt link-cognito-users --dry-run \
    | grep -E 'unmapped|missing' \
    && echo "FAIL: legacy users without a Cognito identity"
  test -f docs/operations/runbooks/cognito-cutover.md \
    || echo "MISSING: cognito cutover runbook (FIND-031)"
  ```

- **Citation:** `STYNX-ADOPT-EXAMPLE.md` §6 #7; `_DISCOVERY.md` §8
  (`packages/cli/src/adopt.ts`); audit **FIND-031** ("No operations
  runbooks") in `07-FINDINGS-REGISTER.md`.

---

### Migrating data from existing soft-delete to archive at cutover

- **Symptom:** Cutover migration runs in production and the helper
  succeeds. Hours later the tenant admin reports: "all our
  deleted-but-recoverable records are now permanently invisible —
  restore returns 404." The rows are not in
  `archive.{schema}_{table}` at all; they were silently dropped
  because `deleted_by_column` was `NULL` and the helper had no value
  for the archive's `deleted_by NOT NULL` column.
- **Root cause:** The archive mirror (`soft-delete-model.md` §14.2)
  has `deleted_at NOT NULL` _and_ `deleted_by NOT NULL`. Legacy
  ad-hoc soft-delete schemas typically recorded `deleted_at` but
  not `deleted_by` — see `resource_record` in
  `STYNX-ADOPT-EXAMPLE.md` §1.4. The transition requires three
  explicit decisions per table: which `deleted_by` to use for
  historical rows; what `archived_at` to record; and whether
  `audit.fn_row_change` should fire for the move (it should be
  **suppressed** via `app.archive_move` — see pitfall #11).
- **Fix:** Wrap the helper call in an explicit setup block:

  ```sql
  BEGIN;

  SELECT set_config('app.archive_move',  'in_progress', true);
  SELECT set_config('app.archive_reason', 'adopt_cutover', true);
  SELECT set_config('app.actor_id',
                    '00000000-0000-0000-0000-000000000000', true);

  INSERT INTO auth.users (id, email, is_active)
  VALUES ('00000000-0000-0000-0000-000000000000',
          'system@stynx.invalid', false)
  ON CONFLICT (id) DO NOTHING;

  SELECT data.adopt_soft_deletable_table(
    live_table          => 'resource_record',
    soft_delete_column  => 'deleted',
    deleted_at_column   => 'deleted_at',
    deleted_by_column   => NULL,
    fallback_deleted_by => '00000000-0000-0000-0000-000000000000'::uuid
  );

  DO $$
  DECLARE archived bigint; expected bigint;
  BEGIN
    SELECT count(*) INTO archived FROM archive.resource_record;
    SELECT count(*) INTO expected
      FROM resource_record_pre_adopt_snapshot WHERE deleted = true;
    IF archived <> expected THEN
      RAISE EXCEPTION 'Adopt move lost rows: % archived vs % expected',
        archived, expected;
    END IF;
  END$$;

  COMMIT;
  ```

  Pair with a smoke test that calls `POST /things/{id}/restore`
  for a sampled archived row.

- **Detection:**

  ```bash
  for f in $(rg -l 'adopt_soft_deletable_table' migrations/); do
    grep -q "app.archive_move" "$f" || echo "MISSING archive_move GUC: $f"
    grep -q "RAISE EXCEPTION"  "$f" || echo "MISSING row-count check: $f"
  done
  psql "$STAGING_URL" -c "
    SELECT 'pre-adopt' k, count(*) FROM resource_record_pre_adopt_snapshot WHERE deleted = true
    UNION ALL SELECT 'archived', count(*) FROM archive.resource_record;"
  ```

- **Citation:** `soft-delete-model.md` §14.2 (archive shape includes
  `deleted_by uuid NOT NULL`); `STYNX-ADOPT-EXAMPLE.md` §3.4;
  `audit-model.md` §9.3 on archive-move GUCs.

---

### RLS policy drift between live and archive mirrors

- **Symptom:** A tenant lists their _live_ records but cannot see
  their _trash_ (`GET /things/_trash` returns empty), despite the
  rows being in `archive.{schema}_{table}`. Or — far worse — the
  inverse: a tenant sees rows from another tenant's archive.
- **Root cause:** Per `soft-delete-model.md` §14.2, both live and
  archive must have `tenant_isolation` policies of the same shape
  with `FOR ALL`, `USING`, `WITH CHECK`, and both `ENABLE` + `FORCE
ROW LEVEL SECURITY`. Hand-written mirrors often paste the live
  policy and forget archive, or apply it but skip `WITH CHECK` /
  `FORCE`. The migration linter detects many of these
  (`_DISCOVERY.md` §7, LINT001–LINT009) but **FIND-004** documents
  that the linter currently fails on existing repo migrations —
  agents cannot fully rely on it.
- **Fix:** Always use `data.create_soft_deletable_table` (or
  `data.alter_soft_deletable_table`). When hand-writing is
  unavoidable, apply this checklist to **both** live and archive:

  ```sql
  ALTER TABLE <schema>.<table> ENABLE  ROW LEVEL SECURITY;
  ALTER TABLE <schema>.<table> FORCE   ROW LEVEL SECURITY;

  CREATE POLICY tenant_isolation ON <schema>.<table>
    FOR ALL
    USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  ```

  Validate symmetry:

  ```sql
  SELECT n.nspname, c.relname,
         c.relrowsecurity, c.relforcerowsecurity,
         pg_get_expr(p.polqual,      p.polrelid) AS using_clause,
         pg_get_expr(p.polwithcheck, p.polrelid) AS check_clause
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
   WHERE (n.nspname, c.relname) IN (
           ('sample', 'example_entity'),
           ('archive','sample_example_entity'));
  ```

  Both rows must have identical `using_clause`, `check_clause`,
  `rls_enabled = true`, `rls_forced = true`.

- **Detection:**

  ```bash
  rg -nU --type sql 'CREATE TABLE archive\.' migrations/
  pnpm --filter @stynx/migration-linter test  # see FIND-004
  psql "$STAGING_URL" -At -f scripts/probe-rls-symmetry.sql
  pnpm --filter apps/reference-api test \
    --testPathPattern 'rls-cross-tenant\.spec\.ts'
  ```

- **Citation:** `soft-delete-model.md` §14.2; `_DISCOVERY.md` §7
  (LINT codes); audit **FIND-004** in `07-FINDINGS-REGISTER.md`.

---

### Treating `withSystemContext` as a free pass (bypasses tenant, NOT audit)

- **Symptom:** A nightly job runs cleanly. Months later, an audit
  query asks "who deleted this row on 2026-03-12?" and `actor_id` is
  `NULL`. Or: a system job is found to be silently writing across
  tenant boundaries because the developer assumed "system context =
  privileged context" and skipped per-tenant scoping.
- **Root cause:** Per `_DISCOVERY.md` §3, **I2** says: "Background
  work obtains an explicit `TenantContext` via
  `withSystemContext(reason, fn)`." It exists to let truly
  cross-tenant background tasks run without a request-scoped
  tenant. It is **not** an audit bypass — every mutation still fires
  audit triggers (`audit-model.md` §9.1 — DB-trigger). It is also
  not a permission bypass — it must pair with `audit.system_op`
  rows recording _why_ system context was entered.
- **Fix:** Two patterns and one lint.

  ```typescript
  // PATTERN A — cross-tenant read, no writes.
  await withSystemContext('nightly_partition_detach', async (db) => {
    return db.query.auditLogPartitions.findMany();  // OK
  });

  // PATTERN B — per-tenant work, scoped explicitly.
  await withSystemContext('retention_sweep', async (sysDb) => {
    const tenants = await sysDb.query.tenants.findMany();
    for (const t of tenants) {
      await sysDb.runAsTenant(t.id, async (db) => {
        await db.tx(async (trx) => {
          await trx.softDelete(resourceRecord, ...);
          // audit row carries tenant_id = t.id ✓
        });
      });
    }
  });

  // ANTI-PATTERN — cross-tenant writes, no scoping. audit.tenant_id = NULL
  await withSystemContext('whatever', async (db) => {
    await db.tx(async (trx) => {
      await trx.softDelete(resourceRecord, someId);  // BAD
    });
  });
  ```

  Pair every `withSystemContext` call with an `audit.system_op`
  insert recording the `reason` and start/finish timestamps.

- **Detection:**

  ```bash
  rg -n 'withSystemContext\b' apps/ packages/
  rg -nU --type ts -A 40 'withSystemContext\(' apps/ packages/ \
    | rg -B 40 '\b(softDelete|hardDelete|insert|update)\(' \
    | rg -L 'runAsTenant\('
  psql "$STAGING_URL" -c "SELECT count(*) FROM audit.log
     WHERE tenant_id IS NULL
       AND occurred_at > now() - interval '1 day';"
  ```

- **Citation:** `_DISCOVERY.md` §3 invariant **I2**; `_DISCOVERY.md`
  §10; `audit-model.md` §9.1, §9.2.

---

### GUC suppression bypassed for archive moves — duplicate audit rows

- **Symptom:** Audit log doubles in size after a release that adds a
  hand-written archive-move path. Every soft delete writes _two_
  `audit.log` rows: one for the live `DELETE` (with `tags = {
soft_delete: true, archived: true }`) and one for the archive
  `INSERT` (with no soft-delete tag). `lgpd_erasure_total` and
  similar counters drift.
- **Root cause:** Per `audit-model.md` §9.3, `audit.fn_row_change()`
  reads `app.archive_move` to _suppress_ the archive INSERT trigger
  during a live → archive move. `@stynx/data`'s `softDelete` /
  `restoreFromArchive` / `hardDeleteFromArchive` (`_DISCOVERY.md`
  §10) all set the GUC. Hand-written code that issues the archive
  INSERT + live DELETE outside `@stynx/data` (one-off SQL during an
  incident, or a service that didn't inject `Transaction`) does
  **not** set the GUC, so the archive INSERT trigger fires normally.
  The audit-model spec calls this out: "get the GUC handling wrong
  and you double-count or miss audit rows." (§9.3 intro.)
- **Fix:** Never write archive moves outside `@stynx/data`.

  ```typescript
  // BAD — bypasses @stynx/data; GUC is unset.
  await pool.query(
    `
    INSERT INTO archive.sample_example_entity
    SELECT * FROM sample.example_entity WHERE id = $1;
    DELETE FROM sample.example_entity WHERE id = $1;
  `,
    [id],
  );

  // GOOD — uses @stynx/data, which sets app.archive_move.
  await db.tx(async (trx) => {
    await trx.softDelete(exampleEntity, id);
  });
  ```

  When hand-written archive moves are genuinely required (rare
  bulk-LGPD scripts), wrap the SQL in the helper's GUC dance:

  ```sql
  BEGIN;
  SELECT set_config('app.archive_move',  'in_progress', true);
  SELECT set_config('app.archive_reason', 'manual_lgpd', true);
  -- archive INSERT + live DELETE
  COMMIT;
  ```

- **Detection:**

  ```bash
  pnpm --filter @stynx/eslint-config exec eslint apps/ \
    --rule '{"no-restricted-imports": ["error", {"paths": ["pg", "pg-pool"]}]}'
  rg -nU 'INSERT\s+INTO\s+archive\.' apps/ packages/ \
    --glob '!packages/data/**'
  psql "$STAGING_URL" -At <<'SQL'
    SELECT row_pk, count(*) FROM audit.log
     WHERE  occurred_at > now() - interval '1 hour'
       AND  schema_name IN ('sample','archive')
       AND  table_name LIKE 'example_entity%'
     GROUP  BY row_pk HAVING count(*) > 1;
  SQL
  ```

- **Citation:** `audit-model.md` §9.3 ("Critical pitfalls (porting)"
  item #1: "Custom archive movement code that bypasses `@stynx/data`
  and forgets the GUC will produce duplicate audit rows."); audit
  **FIND-009** ("No ESLint rule blocking `pg`/`Pool` outside
  `@stynx/data`").

---

### Permission seeding order — perms before role_permissions FK

- **Symptom:** Adoption migration fails with `insert or update on
table "role_permissions" violates foreign key constraint
"role_permissions_permission_id_fkey"`. Or, on a different
  ordering, the migration succeeds but a re-run is impossible
  because permissions were seeded twice without `ON CONFLICT` and
  `auth.permissions` now has duplicate-key violations.
- **Root cause:** Per `_DISCOVERY.md` §6.1, the platform migrations
  declare `auth.permissions` and `auth.role_permissions` in
  `0005_auth.sql`, with the latter holding an FK to the former.
  Adoption codemods generate per-app permission seeds plus role
  bindings that reference them. If seed order is reversed — or both
  inlined in one file with the wrong statement order — the FK
  breaks. Re-running a partial failure breaks if the seed is not
  idempotent.
- **Fix:** Two rules.
  1. **Order**: `auth.permissions` rows seed first, in their own
     migration file (or as the first statement of a combined
     migration). `auth.role_permissions` references them by stable
     `key`, not by surrogate id.
  2. **Idempotency**: every seed uses `ON CONFLICT ... DO NOTHING`.

     ```sql
     INSERT INTO auth.permissions (key, description) VALUES
       ('resource_record:read:*',     'List/get resource records'),
       ('resource_record:write:*',    'Create/update resource records'),
       ('resource_record:delete:*',   'Soft-delete resource records'),
       ('resource_record:restore:*',  'Restore archived records'),
       ('resource_record:read_trash:*','View archived records')
     ON CONFLICT (key) DO NOTHING;

     -- Separate migration (or strictly later):
     INSERT INTO auth.role_permissions (role_key, permission_id)
     SELECT 'tenant_admin', p.id FROM auth.permissions p
      WHERE p.key LIKE 'resource_record:%'
     ON CONFLICT (role_key, permission_id) DO NOTHING;
     ```

- **Detection:**

  ```bash
  rg -l 'INSERT INTO auth\.role_permissions' migrations/ apps/ \
   | while read f; do
       grep -q 'INSERT INTO auth\.permissions' "$f" \
         || echo "REVIEW order: $f references role_permissions but doesn't seed permissions"
     done
  rg -nU 'INSERT INTO auth\.(permissions|role_permissions)' \
      migrations/ apps/ | rg -L 'ON CONFLICT'
  pnpm stynx migrate up && pnpm stynx migrate up   # idempotency gate
  ```

- **Citation:** `_DISCOVERY.md` §6.1 (`0005_auth.sql`);
  `STYNX-ADOPT-EXAMPLE.md` §4 ("PERMISSION KEY DESIGN").

---

### `is_active` vs soft-delete confusion

- **Symptom:** A tenant is "deactivated" via `is_active = false` on
  `tenancy.tenants` and later soft-deleted. Reports based on "active
  tenants" agree, but reports based on "tenants ever in the system"
  miss the deactivated-then-deleted ones because the query writer
  conflated the two. Or: a developer adds `is_active` to a domain
  table thinking it gives soft-delete semantics, then is surprised
  when "deletion" leaves the row visible to other tenants.
- **Root cause:** `soft-delete-model.md` ("`is_active` is **not**
  soft delete"): "`auth.users` and `tenancy.tenants` carry
  `is_active` for _temporary suspension_. Orthogonal to soft delete,
  which represents _removed-with-recall_." STYNX's soft delete is a
  row-move to a different schema with full
  audit/archive/RLS semantics; `is_active` is a filter flag with
  neither.
- **Fix:**
  1. **Reserve `is_active`** for `auth.users.is_active` and
     `tenancy.tenants.is_active`. Do not add it to a new domain
     table to mean "soft delete"; use
     `data.create_soft_deletable_table` instead.
  2. **For tables that legitimately need both**, document
     composition. A query that reports "active, not-deleted
     tenants" filters by `isActive` only — soft-deleted tenants are
     already excluded because they live in
     `archive.tenancy_tenants`, not `live`.
  3. **`stynx doctor` emits an info note** when a soft-deletable
     live table also carries `is_active` (`soft-delete-model.md`).
     Treat it as a code-review prompt.

- **Detection:**

  ```bash
  rg -nU --type sql 'is_active\s+boolean' migrations/ apps/ \
    | rg -v '0004_tenancy\.sql' | rg -v '0005_auth\.sql'
  pnpm stynx doctor 2>&1 | rg 'is_active.*soft.*delet'
  rg -n --type sql '\b(is_deleted|is_archived|deleted)\s+boolean' \
      migrations/ apps/
  ```

- **Citation:** `soft-delete-model.md` "`is_active` is **not** soft
  delete"; `_DISCOVERY.md` §3 invariant **I8**.

---

## Cross-pitfall checklist

Before opening the cutover PR, confirm:

- [ ] No raw `pool.query` / direct `pg` import outside `@stynx/data`
      (pitfall #11; FIND-009).
- [ ] Every legacy `organization_id` column was triaged before rename
      (#1).
- [ ] Every `deleted` / `deleted_at` row was triaged before
      `data.adopt_soft_deletable_table` (#2).
- [ ] Every adopted table has `updated_at` + `updated_by`, and the
      backfill story is documented in the migration header (#3).
- [ ] Token-shape adapter is in place + a metric counter for legacy
      claims is wired (#4).
- [ ] FK annotations have been human-reviewed; `block` count is
      justified (#5).
- [ ] Every surviving `sql\`...\`` block has a Zod return-shape
      parse (#6).
- [ ] Cognito users were provisioned and `link-cognito-users
    --dry-run` reports no unmapped legacy users (#7).
- [ ] Adopt migration sets `app.archive_move` GUCs and asserts
      row-count parity (#8).
- [ ] RLS symmetry probe passes for every soft-deletable table (#9).
- [ ] No `withSystemContext` callback writes without an inner
      `runAsTenant` scope (#10).
- [ ] Permission seeds are idempotent and ordered before
      `role_permissions` (#12).
- [ ] No new domain table carries `is_active` as a soft-delete
      proxy (#13).

---

## Open follow-ups grounded in audit findings

These are audit items the porting agent should re-verify before
relying on a detection step that depends on them:

- **FIND-004** — migration linter may still fail on repo migrations.
  Several "Detection" commands above invoke `pnpm --filter
@stynx/migration-linter test`; if the linter is broken, fall back
  to the SQL probes shown alongside.
- **FIND-009** — no ESLint rule blocking `pg`/`Pool` outside
  `@stynx/data`. Pitfall #11's detection step assumes the rule is
  in place; if it isn't, add the rule as part of the porting PR.
- **FIND-010** — `@stynx/privacy` directly imports `@aws-sdk/client-s3`
  in violation of **I3**. Not introduced by porting, but if I3
  enforcement is wired (e.g. `eslint-plugin-boundaries`), expect it
  to flag privacy as well.
- **FIND-011** — `pnpm doctor` emits empty output. Pitfall #13's
  detection grep assumes doctor surfaces an `is_active` info note;
  if doctor is silent, rely on the SQL probe instead.
- **FIND-031** — operations runbooks absent. Pitfall #7's "Fix"
  references `docs/operations/runbooks/cognito-cutover.md`; that
  tree does not yet exist and adoption work touching Cognito should
  add it.

---

_End of common pitfalls._
