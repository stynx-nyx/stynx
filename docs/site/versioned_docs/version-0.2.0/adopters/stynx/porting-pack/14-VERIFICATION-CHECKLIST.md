# 14 — Verification Checklist

Checkboxes the consuming agent marks off to declare the port done.
Every item is a runnable command or an inspection step. Maps
directly to STYNX's invariants, mandatory test families, and the
`stynx doctor` output.

## Per-invariant verification

### I1 — No raw DB connection outside `@stynx/data`

```sh
rg -nE "from ['\"]pg['\"]|new Pool\(" --type ts \
  | rg -v 'packages/data|packages/cli|test|migrations'
```

- [ ] Output is empty (modulo documented exceptions in ADR-003 if
      Path B was chosen for FIND-010).

### I2 — No query outside a request context

```sh
# Inspect background scripts, cron jobs, queue workers
rg -nE "Database|db\.tx" path/to/scripts/ \
  | rg -v 'withSystemContext'
```

- [ ] Every match either runs inside an HTTP request or wraps in
      `withSystemContext('reason', fn)`.

### I3 — No direct S3 client outside `@stynx/storage`

```sh
rg -n "@aws-sdk/client-s3" --type ts \
  | rg -v 'packages/storage'
```

- [ ] Output is empty (or limited to documented exceptions).

### I4 — Every HTTP route has a permission

```sh
pnpm doctor 2>&1 | tail -30
```

- [ ] `pnpm doctor` exits 0.
- [ ] Output reports route coverage check passing. (If FIND-011 is
      live, add manual fallback: grep controllers and confirm every
      `@Get/@Post/@...` is paired with `@Permission/@Public/@System`.)

### I5 — Every tenant-scoped table has `tenant_id` and RLS

```sh
pnpm --filter @stynx/migration-linter exec migration-linter \
  apps/<your-app>/migrations
```

- [ ] Linter exits 0; no `LINT001` or related issues.
- [ ] (If FIND-004 still live: spot-check by querying
      `pg_class.relrowsecurity` for every tenant-scoped table.)

### I6 — Every mutation is audited

```sh
rg -nE "@Audit\(|@NoAudit\(" apps/<your-app>/src --include='*.controller.ts'
```

- [ ] Every mutation method has either `@Audit` or `@NoAudit('reason')`.

### I7 — `@ReadOnly()` routes use `stynx_reader`

- [ ] Read-only reporting endpoints carry `@ReadOnly()`.
- [ ] Integration test: a `@ReadOnly()` route attempting an INSERT
      raises `ReadOnlyViolationError`.

### I8 — Soft-deletable live tables have archive mirrors and no `deleted_at`

```sh
rg -n "deleted_at\s+timestamp" apps/<your-app>/migrations \
  | rg -v 'archive/'
```

- [ ] Output is empty (no `deleted_at` on any live table).
- [ ] For every soft-deletable live table, an
      `archive.&#123;schema&#125;_&#123;table&#125;` mirror exists in the same migration.

## Mandatory test families

Per `STYNX-SPEC-v0.6.md` §25 (testing), the consuming codebase must
have at least one test in each family.

- [ ] **RLS leak test** using the `expectRlsLeakageDetection` matcher
      from `@stynx/testing`.
- [ ] **Soft-delete + restore round-trip** — assert archive mirror
      receives the row, restore returns it, audit row written for
      both transitions.
- [ ] **Cascade limit test** — exceeding `maxCascadeDepth` or
      `maxCascadeRows` raises `CascadeTooDeepError` /
      `CascadeTooLargeError`.
- [ ] **Permission deny path** — unauthenticated request returns
      401 with the documented error shape; authenticated but
      unauthorized returns 403.
- [ ] **Idempotency replay** — same `Idempotency-Key` returns the
      cached response; new key executes anew.
- [ ] **LGPD erasure dry-run** — `@stynx/privacy` produces an
      erasure plan touching live + archive without writing.
- [ ] **Audit row written for every mutation** in a sampled
      controller.
- [ ] **`@ReadOnly()` enforcement** — a `@ReadOnly()` route
      attempting a write raises `ReadOnlyViolationError`.

## Doctor

- [ ] `pnpm doctor` (or `node packages/cli/dist/main.js doctor`)
      exits 0.
- [ ] Output is non-empty and lists each check's status.
- [ ] Deliberately removing `@Permission` from one route causes
      doctor to fail (proves the gate works).

## Smoke tests

### Tenant lifecycle

```
provision tenant
  → create user
    → log in (Cognito → STYNX exchange)
      → create resource (record + note + work item)
        → soft-delete record
          → assert record absent from live, present in archive
            → restore record
              → assert back in live with no FK violations
                → hard-delete record
                  → assert absent from both live and archive
```

- [ ] Every step succeeds end-to-end.

### LGPD round-trip

```
populate fixture (user with PII across multiple tables, including archive rows)
  → request export
    → assert export contains live + archive rows
      → request erasure
        → assert each PII column processed per its strategy
          → assert audit row tagged lgpd_erasure
            → assert 5-year hot retention partition has the row
```

- [ ] Export and erasure both produce expected results.

## Sentinel cleanup

```sh
rg -n "TODO_PERMISSION|TODO_AUDIT|TODO_TENANCY" apps/<your-app>/src
```

- [ ] Output is empty.

## Build &amp; CI green

- [ ] `pnpm -w typecheck` exits 0.
- [ ] `pnpm -w lint` exits 0.
- [ ] `pnpm -w test` exits 0.
- [ ] `pnpm -w test:int` exits 0.
- [ ] CI on the consuming repo includes: lint, typecheck, unit,
      integration, build, doctor, migration-linter as required
      checks.

## Done criteria

The port is complete when **every box above is checked**. If any
remains unchecked, the port is not done — even if the application
runs. STYNX's value is in the invariants; an unchecked invariant is
unbacked promise.
