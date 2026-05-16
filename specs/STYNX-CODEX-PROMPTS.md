# STYNX — Codex Prompt Sequence for v1.0 Implementation

> A linear sequence of prompts to drive an agentic coding tool (Codex, Claude Code, Cursor, GitHub Copilot Workspace, or equivalent) through converting a partially‑developed STYNX repo into a complete v1.0 implementation.

**Assumptions:**

- The partial repo exists at the working directory root.
- STYNX specification documents live under `./specs/` and include:
  - `STYNX-SPEC-v0.6.md` (normative spec)
  - `STYNX-ADR-001-soft-delete.md`
  - `STYNX-ADR-002-perms-caching.md`
  - `STYNX-API-DATA.md`
  - `STYNX-REFERENCE-MIGRATION.sql`
  - `STYNX-ADOPT-EXAMPLE.md`
  - `STYNX-CDK-SKELETON.md`
- The target is production‑grade TypeScript on NestJS + Angular, Drizzle ORM + `pg`, PostgreSQL 16, Redis 7, AWS (sa‑east‑1). macOS dev environment.

---

## Conventions

Each prompt is self‑contained and assumes the repo is in the state left by the previous prompt. Every prompt expects the agent to:

1. **Read the referenced spec sections first** before writing code. The spec is authoritative; if the prompt conflicts with the spec, the spec wins and the agent should surface the conflict.
2. **Work on a feature branch** named `stynx/NN-<short‑slug>` where `NN` is the prompt number.
3. **Produce a PR** with a descriptive title, a body summarizing what was done and any deviations from the prompt, and a CI run.
4. **Meet the success criteria** listed explicitly.
5. **Run the verification commands** and paste output into the PR description.
6. **Flag any ambiguity or missing context** in the PR description under a `Questions / Deviations` heading rather than silently guessing.

When a prompt says "create package `@stynx/foo`," it means: add the package to the monorepo, wire it into the workspace, implement it per spec, unit‑test the public surface, and document the public API in the package README.

No implementation ships without tests. No tests ship without passing CI. Coverage thresholds per package are enforced (see Prompt 2).

---

## Prompt 0 — Repository Audit and Gap Analysis

```
You are starting work on the STYNX platform. Read the full specification set under ./specs/, starting with STYNX-SPEC-v0.6.md.

Do not write any implementation code yet. Your task is to produce a gap analysis of the current repository state against the v1.0 target.

Output a single file at ./audit/REPO-GAP-ANALYSIS.md with:

1. Inventory. Every directory and file currently in the repo, categorized as: conformant (matches spec as-is), partial (matches spec but incomplete), divergent (needs rework), obsolete (should be deleted), or missing (spec'd but absent).

2. Package-level matrix. One row per spec'd package (@stynx/core, @stynx/auth, @stynx/tenancy, @stynx/data, @stynx/storage, @stynx/audit, @stynx/logging, @stynx/health, @stynx/sessions, @stynx/ratelimit, @stynx/idempotency, @stynx/privacy, @stynx/i18n, @stynx/testing, @stynx/contracts, @stynx/cli, plus every @stynx-web/* package). Columns: exists?, % complete estimate, notable gaps, estimated effort (S/M/L/XL).

3. Invariant compliance check. For I1-I8 per SPEC §1.3, state whether the invariant is enforceable in the current repo and what mechanism enforces it (linter, guard, runtime check, absent).

4. Critical path. List the prompts in this sequence (1-N) that would be no-ops given the current state, and the prompts that will do the bulk of the work.

5. Risk register. Any architectural drift from the spec already baked in that will be expensive to remove. Call these out early so they can be addressed before compounding.

Do not modify any existing code in this prompt. If you find broken code that prevents reading the repo (e.g., binary noise in text files), note it in the gap analysis.

Success criteria:
- ./audit/REPO-GAP-ANALYSIS.md exists and covers all five sections above.
- Every package spec'd in SPEC §3 appears in the package matrix.
- No code changes outside ./audit/.

Verification:
- `wc -l audit/REPO-GAP-ANALYSIS.md` shows a substantive document (>200 lines expected).
- `git diff --stat` shows only additions under ./audit/.
```

---

## Phase 1 — Monorepo and Tooling

### Prompt 1 — pnpm Workspace + Turborepo + Changesets

```
Read SPEC §3 (Monorepo Layout) and §17 (Repo Governance).

Set up the monorepo foundation. If these are already partially present, reconcile to the spec without breaking any existing package source.

Deliverables:
- pnpm-workspace.yaml listing packages/*, packages-web/*, apps/*, tools/*.
- Root package.json with pnpm@9+, Node 20 engines constraint, Turborepo, Changesets as devDependencies.
- turbo.json with pipelines: build, lint, typecheck, test, test:int, test:e2e, clean. Pipelines declare correct dependencies (test depends on ^build, etc.).
- .changeset/config.json configured for GitHub Packages publishing, scope @stynx and @stynx-web, baseBranch main, access restricted.
- .npmrc in repo root pointing @stynx:* and @stynx-web:* to npm.pkg.github.com with auth=${NODE_AUTH_TOKEN}.
- Root README.md describing monorepo layout mirroring SPEC §3.

If the repo currently uses npm, yarn, or lerna, migrate to pnpm+turbo and delete the prior tooling. Preserve package source; only metadata and lockfiles change.

Success criteria:
- `pnpm install` completes cleanly.
- `pnpm turbo run build --dry-run` lists every existing package.
- `pnpm changeset` prompts interactively.
- No circular workspace dependencies.

Verification:
- `pnpm -w install && pnpm turbo run build` green (or clearly failing only on packages that don't yet exist).
```

### Prompt 2 — Shared Tooling (eslint, tsconfig, commitlint, prettier)

```
Read SPEC §16 (Repo Governance), §15 (Testing Framework).

Create tools/tsconfig and tools/eslint-config as internal workspace packages. Every runtime package extends from these.

Deliverables:
- tools/tsconfig/base.json: strict, ES2022, module NodeNext, isolatedModules, noUncheckedIndexedAccess, exactOptionalPropertyTypes. One preset per target: base, node20, angular18, lib.
- tools/eslint-config: a flat config (ESLint 9 style) exporting:
  - rules for plain TS libs
  - rules for NestJS (e.g., no-extraneous-class off, prefer const enums off)
  - rules for Angular
  - 'no-restricted-imports' forbidding deep imports between @stynx packages (only barrel imports from index)
  - rule enforcing no direct `pg.Pool` import outside @stynx/data
  - rule enforcing no `fetch` to S3 URLs outside @stynx/storage
  Use eslint-plugin-boundaries or an equivalent mechanism for the inter-package rules.
- Root `package.json` `prettier` field with 2-space indent, 100-col width, single quotes, trailing commas all, semicolons on.
- tools/repo-config/commitlint.config.cjs with @commitlint/config-conventional + an allowed-scopes list matching package names.
- husky pre-commit running lint-staged on changed files; commit-msg hook running commitlint.
- .github/CODEOWNERS: every @stynx/* and @stynx-web/* path requires platform-architects group review.

Coverage thresholds in root jest config (or package-level override): statements 85, branches 80, functions 85, lines 85. Higher per package: @stynx/auth and @stynx/data require 95+.

Success criteria:
- `pnpm lint` runs against a test file and reports expected violations.
- `pnpm exec commitlint --edit .git/COMMIT_EDITMSG` works against a malformed message.
- Every tsconfig preset compiles a hello-world sample successfully.

Verification:
- `pnpm lint && pnpm typecheck` green on the empty repo state.
```

### Prompt 3 — GitHub Actions CI Pipeline

```
Read SPEC §16.2 (PR gates) and §16.3 (Release).

Create the GitHub Actions workflow set.

Deliverables:
- .github/workflows/ci.yml:
  - Triggers: pull_request, push to main.
  - Matrix: Node 20. macOS runner for at least one job (integration tests use Docker; Linux runners work, but honor local-dev parity where cheap).
  - Jobs in order (with caching): install -> lint -> typecheck -> unit tests -> integration tests (with Testcontainers or docker compose) -> build -> stynx doctor.
  - All jobs required for PR merge.
  - Coverage artifact uploaded per package.
- .github/workflows/release.yml:
  - Triggered on merge to main.
  - Runs Changesets: if there are unreleased changes, opens/updates a Version Packages PR; when that PR is merged, publishes to GitHub Packages using GITHUB_TOKEN.
  - Tags and creates GitHub Release per package.
- .github/workflows/ephemeral-env.yml (optional in this prompt; stub acceptable):
  - PR-triggered, provisions an ephemeral env via CDK context env=ephemeral-{pr-id}. Leave as a TODO if infra isn't ready.
- .github/dependabot.yml grouping: aws-sdk group, nest group, angular group, dev group. Renovate config as alternative if preferred; pick one.

Success criteria:
- Opening a PR triggers ci.yml and all required checks run.
- A forced test failure in any package blocks merge.
- `pnpm changeset version` + `pnpm changeset publish` would succeed end-to-end against GitHub Packages (dry-run acceptable; document the auth token env var).

Verification:
- Push a branch, open a PR, confirm CI green on empty state.
```

---

## Phase 2 — Core Packages

### Prompt 4 — @stynx/core

```
Read SPEC §3, §1.3 (Invariants I1/I2), §10 (Logging context), §18 (Configuration).

Create packages/core. This is the root runtime package all other @stynx/* packages depend on.

Deliverables:
- StynxCoreModule (NestJS dynamic module) with forRoot(options) and forRootAsync().
- RequestContext service backed by nestjs-cls (AsyncLocalStorage). Exposes: requestId, tenantId?, actorId?, sessionId?, locale, startedAt. Setting these outside the interceptor must throw.
- RequestContextInterceptor: on every HTTP request, generates a UUIDv7 requestId (or accepts one from X-Request-Id header; validates length/shape), stores it in CLS, adds it to the response headers on the way out.
- Config loader: Zod-based. Reads from process.env with a schema provided at forRoot. Fails fast on validation error. Supports layered defaults: defaults -> env -> SSM Parameter Store (behind a flag; when enabled, loads from /stynx/{env}/{app}/*).
- Secret loader: SDK v3 wrapper around Secrets Manager. Lazy; caches for 5 minutes; re-fetches on connection error callback.
- ErrorFilter: maps StynxError subclasses to HTTP responses with code+context+status. Passes through HttpException. Logs 5xx at error, 4xx at warn.
- SystemContext service with withSystemContext(reason, fn) per SPEC §4.6 and §14.6.

Test coverage 95+. Integration test runs a tiny NestJS app with the module imported and verifies request-id propagation, config validation failures, and system-context audit writes (stubbed).

Success criteria:
- Any other @stynx/* package can import { Database, RequestContext, withSystemContext } at the types level without cyclic dependency.
- Attempting to read RequestContext.tenantId outside an active request throws with a clear error.
- Config with a wrong shape refuses to boot.

Verification:
- pnpm --filter @stynx/core test green.
- pnpm --filter @stynx/core test:int green against a stub NestJS app.
```

### Prompt 5 — @stynx/logging

```
Read SPEC §10 (Logging).

Create packages/logging on top of @stynx/core.

Deliverables:
- StynxLoggingModule wiring Pino with:
  - JSON output in prod, pino-pretty in dev (NODE_ENV-based).
  - Redact list: password, token, authorization, cookie, idToken, accessToken, refreshToken, secret. Accept additional paths via forRoot option.
  - Base fields auto-attached from RequestContext (request_id, tenant_id, actor_id, session_id, route, method, locale, status, duration_ms when known).
- Pino transport for Fluent Bit forwarding (stdout; Fluent Bit runs as sidecar in prod).
- StynxLogger service injectable anywhere. Drop-in replacement for NestJS's Logger in terms of surface but augments with RequestContext.
- Request logger middleware: logs one INFO on response with method/route/status/duration_ms. Skips /healthz, /readyz, /metrics.
- Rate limiting of noisy log lines: dedup identical error message + stack within 60s (count aggregated; configurable).

Success criteria:
- Logs include RequestContext fields on every line produced inside a request.
- Redaction confirmed with unit test that asserts a sensitive field never appears in the serialized output.
- Production config refuses to start if redact list is empty (defensive guard).

Verification:
- Unit + integration tests green.
- Against a sample NestJS app, `curl /endpoint` produces one well-formed JSON log line with request_id echoing back in response header.
```

### Prompt 6 — @stynx/health

```
Read SPEC §11 (Health & Observability).

Create packages/health.

Deliverables:
- StynxHealthModule with:
  - GET /healthz: liveness, 200 if process is up, no deps checked.
  - GET /readyz: readiness, checks PG (SELECT 1), Redis (PING), JWKS cache loaded, S3 canary HEAD. Returns 503 with structured body listing failures if any.
  - GET /metrics: Prometheus text format via prom-client. Restricted to private subnets via an optional IP allowlist from config.
  - GET /info: platform-role gated (requires @stynx/auth for real use; stub the guard in this package to a simple env-flag gate, with a TODO to swap once auth is available).
- Baseline metrics registered (SPEC §11.2):
  - http_request_duration_seconds, http_request_total
  - db_pool_in_use/idle/waiting (gauges populated by @stynx/data when wired; emit zero stubs here)
  - authz_deny_total, ratelimit_block_total, idempotency_replay_total, storage_presign_total
  - soft_delete_total, hard_delete_total, restore_total
  - lgpd_erasure_total{table,strategy}
  - archive_size_bytes{table} — stub the sampler; actual implementation lives in @stynx/data (see Prompt 10)
  - session_active_total
- Terminus integration for readyz dependency checks; pluggable via a StynxHealthIndicator interface so other packages add their own checks.

Success criteria:
- /healthz returns 200 even when DB is down; /readyz returns 503 with the DB listed as failed.
- /metrics returns valid Prometheus text even with zero data.
- /info requires platform-role flag.

Verification:
- Package tests green; sample NestJS app demonstrates all four endpoints.
```

---

## Phase 3 — Data Layer (the biggest phase)

### Prompt 7 — @stynx/data Bootstrap: Drizzle, Pool, Three Roles

```
Read SPEC §4.3-4.4, §13, and the entirety of STYNX-API-DATA.md. Read ADR-001 for context.

Create packages/data and implement the foundation. No soft-delete operations in this prompt; those arrive in Prompt 10.

Deliverables:
- StynxDataModule with forRoot({connections: {owner, app, reader}, migrations: {...}}).
- Three pg.Pool instances, one per role. Connection strings via config from Secrets Manager. Pool sizing per SPEC §13.1 defaults: 20 per role per pod, 2 for owner.
- Drizzle schema for the five STYNX schemas (core, tenancy, auth, audit, archive placeholder, storage) — tables spec'd in SPEC §7 and §14.2. Archive schema types go to packages/data/src/internal/archive-schema and are NOT exported from the barrel.
- Database service per STYNX-API-DATA.md §3.
- Transaction helper per STYNX-API-DATA.md §3.2:
  - tx(fn, options) with TxOptions (isolation, readonly, role, replica, retry, deadlineMs).
  - On entry: SET LOCAL app.tenant_id, app.actor_id, app.request_id, app.session_id, app.role as first statement. All reads from RequestContext.
  - Nested tx via SAVEPOINT.
  - Retry on 40001/40P01 with jitter.
  - readonly: true issues SET LOCAL TRANSACTION READ ONLY.
  - role: 'owner' throws SystemContextRequiredError unless called from withSystemContext.
- Error classes from STYNX-API-DATA.md §7, all extending StynxDataError.
- Do NOT yet implement: softDelete, restoreFromArchive, withDeleted, onlyDeleted, migration helpers.
- Unit tests: 95%+ coverage. Integration tests use Testcontainers (postgres:16) and verify GUCs are set correctly per transaction, retry behavior, three-pool isolation.

The migration system can be stubbed for now (use Drizzle Kit SQL generation and a simple runner). A full migration CLI lands in Prompt 24.

Success criteria:
- A consumer can inject Database, call tx(fn), and observe correct GUC values inside fn via SELECT current_setting('app.tenant_id').
- Attempting role: 'owner' from a request context throws.
- Attempting DML under role: 'reader' throws ReadOnlyViolationError.
- Retry on a manufactured serialization_failure eventually succeeds.

Verification:
- pnpm --filter @stynx/data test:int green against docker-compose postgres.
```

### Prompt 8 — Database Roles, RLS Bootstrap, and Core Platform Migrations

```
Read SPEC §4.4 (Three database roles, GUC plumbing), §7 (Identity data model), §9 (Audit schema).

This prompt lays down the SQL migrations for the STYNX platform itself. The helpers these migrations reference (create_soft_deletable_table, audit.enable_for, etc.) arrive in Prompts 9 and 17; use placeholders that will be filled in.

Deliverables (as versioned Drizzle migrations under packages/data/migrations/platform/):
- 0001_roles.sql: CREATE ROLE stynx_owner, stynx_app, stynx_reader with correct BYPASSRLS / NOINHERIT flags. GRANT CONNECT on current_database.
- 0002_extensions.sql: CREATE EXTENSION pgcrypto, citext, pg_stat_statements.
- 0003_schemas.sql: CREATE SCHEMA core, tenancy, auth, audit, storage, archive AUTHORIZATION stynx_owner. GRANT USAGE to stynx_app, stynx_reader on non-audit schemas; audit schema SELECT only to stynx_app, no access to stynx_reader.
- 0004_tenancy.sql: tenancy.tenants and tenancy.tenant_settings per SPEC §7.
- 0005_auth.sql: auth.users, auth.memberships, auth.roles, auth.perms, auth.role_perms, auth.membership_roles, auth.direct_perms, auth.groups, auth.group_memberships, auth.group_roles, auth.sessions (partitioned monthly), auth.invitations. All per SPEC §7. RLS + policies on tenant-scoped tables.
- 0006_auth_effective_hash.sql: add effective_hash text and effective_hash_generation bigint to auth.memberships per ADR-002 §2.5.
- 0007_core.sql: core.config, core.rate_limit_overrides, core.idempotency_keys, core.schema_migrations (Drizzle Kit table - may already exist), core.softdelete_fk_registry, core.pii_map.
- 0008_audit.sql: audit.log partitioned by RANGE (occurred_at) monthly, audit.system_op, audit.fn_row_change() trigger function per SPEC §9.3 with archive-move GUC suppression logic.
- 0009_grants_ddl_privileges.sql: default privileges per schema so new tables get RW to stynx_app, RO to stynx_reader automatically. Audit schema default SELECT to stynx_app only.

All migrations use explicit transaction boundaries. All migrations are idempotent (IF NOT EXISTS patterns where safe). Default privileges set via ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner.

Add a migration runner to @stynx/data that executes these in order on first boot if the core.schema_migrations table reports them missing.

Success criteria:
- Fresh postgres container reaches a state with all three roles, six schemas, and every platform table created.
- Running the runner twice is a no-op.
- Connecting as stynx_app can INSERT into auth.users only after SET LOCAL app.tenant_id (RLS); connecting as stynx_reader cannot INSERT anywhere.

Verification:
- Integration test: boot the module, assert pg_class contains expected tables, assert RLS is FORCE on every tenant-scoped table.
```

### Prompt 9 — Archive Schema Helpers

```
Read STYNX-SPEC-v0.6.md §14.3, STYNX-REFERENCE-MIGRATION.sql, and STYNX-API-DATA.md §6.

Implement the SQL-callable helpers used by consumer migrations to create and evolve soft-deletable tables.

Deliverables (as a single migration 0010_data_helpers.sql in packages/data/migrations/platform/):
- data schema (CREATE SCHEMA data AUTHORIZATION stynx_owner).
- data.create_soft_deletable_table(ddl text): parses the CREATE TABLE (use regex or, preferably, pg_query via plpgsql; basic regex acceptable for v1.0 if limitations are documented). Emits:
  - The live table as written.
  - The archive mirror at archive.{schema}_{table} with identical column set + archive_id bigserial PK, archived_at timestamptz default clock_timestamp(), deleted_at timestamptz not null, deleted_by uuid not null, last_erasure_at timestamptz null.
  - RLS + tenant_isolation policy on both (only if live table has tenant_id column; else raise).
  - Default archive indexes: on (id), (tenant_id), (deleted_at DESC).
  - audit.enable_for on both.
- data.alter_soft_deletable_table(live_table regclass, alter_stmt text): applies ALTER to live and to archive in one transaction. Understands ADD COLUMN, DROP COLUMN, ALTER COLUMN TYPE. Rejects unsafe alters with clear errors. Constraints (UNIQUE, FK, CHECK) applied to live only.
- data.register_softdelete_fk(parent_schema, parent_table, child_schema, child_table, fk_constraint, behavior). Validates behavior in (hide, cascade, block). Inserts into core.softdelete_fk_registry.
- data.softdelete_fk_audit(): returns child tables missing registry entries for FKs targeting soft-deletable parents. Used by stynx doctor.
- data.archive_mirror_name(schema, table): returns 'archive.{schema}_{table}'. Also: detects naming collisions by reverse-parsing existing archive table names, returns a conflict if the target exists and was produced from a different source.
- data.adopt_soft_deletable_table(live_table, soft_delete_column, deleted_at_column, deleted_by_column): one-shot adoption helper that creates the archive mirror AND backfills rows where soft_delete_column = true, per STYNX-ADOPT-EXAMPLE.md §3.4.

All functions: SECURITY DEFINER OWNED BY stynx_owner. GRANT EXECUTE to stynx_owner only (migrations run as owner).

Unit tests: pure SQL via pg-unit or equivalent, in packages/data/test/sql/.

Success criteria:
- Calling data.create_soft_deletable_table with a sample CREATE TABLE produces the expected objects (verified by querying information_schema).
- Calling it twice is detected as collision.
- data.register_softdelete_fk rejects invalid behaviors.
- data.adopt_soft_deletable_table successfully migrates a legacy table with ad-hoc deleted column.

Verification:
- Integration test: create a sample soft-deletable table and verify live/archive parity, RLS on both, audit enabled on both.
```

### Prompt 10 — Soft Delete Operations, Cascade, Restore

```
Read STYNX-API-DATA.md §5 (in full), SPEC §14 (§14.5-14.8 especially), ADR-001 §B.

Implement softDelete, restoreFromArchive, restoreWithCascade, hardDelete, hardDeleteFromArchive on the Transaction class in @stynx/data.

Deliverables:
- Transaction.softDelete<T>(table: SoftDeletableTable<T>, id, options): implements the algorithm in STYNX-API-DATA.md §5.1 sequence:
  1. Verify context and role.
  2. Pre-count cascade subtree via core.softdelete_fk_registry + indexed FK lookups.
  3. Check limits (depth <= maxCascadeDepth, rows <= maxCascadeRows). Defaults from core.config (4 / 100). Options override.
  4. dryRun: true returns CascadePlan without mutation.
  5. Recurse into cascade children (leaves first).
  6. Set SET LOCAL app.archive_move='in_progress', app.archive_reason='soft_delete'.
  7. INSERT into archive from live, DELETE from live. Catch foreign_key_violation and surface SoftDeleteBlockedError with blocking children list.
- Transaction.restoreFromArchive: implements STYNX-API-DATA.md §5.3 sequence including uniqueness pre-check, archived-parent detection, optional cascade.
- Transaction.restoreWithCascade: thin convenience wrapper per §5.4.
- Transaction.hardDelete and Transaction.hardDeleteFromArchive per §5.5-5.6 with literal-string confirmation enforced by the type system.
- SoftDeletableTable<T> and LiveOnlyTable<T> brand types per STYNX-API-DATA.md §2.6. softDeletable() helper function (take a drizzle table, brand it, register in an internal registry).
- All CascadeTooDeep/TooLarge/Blocked/Conflict errors carry structured context objects matching the shapes in ADR-001.
- Cascade depth and row counting MUST pre-count without mutation; failure to reserve state is a hard requirement.
- Metrics: increment soft_delete_total{table}, hard_delete_total{table}, restore_total{table} on success. Include archive_size_bytes sampler (daily timer, one-designated-pod pattern - use Redis SETNX leader election).

Comprehensive tests:
- Unit: brand type enforcement (compile error cases documented in a /// @ts-expect-error test).
- Integration: realistic FK graph (record > note, record > work_item > work_item_entry, work_item > work_item_lock with block) exercising all three annotations. Timestamp equality for cascade restore. 409 responses for every error class.

Success criteria:
- All nine mandatory test families from SPEC §16.3 relevant to @stynx/data pass.
- Calling softDelete on a LiveOnlyTable is a compile error, not a runtime error.
- Dry-run returns a CascadePlan and mutates nothing (verified by snapshot).

Verification:
- Coverage 95%+ on this module.
- Integration suite green against the reference migration schema (see Prompt 23 for the reference app; use packages/data/test/fixtures/ for now).
```

### Prompt 11 — Query Helpers: withDeleted, onlyDeleted, Default Live

```
Read STYNX-API-DATA.md §4, SPEC §14.4.

Implement the query builder extensions on Transaction.

Deliverables:
- trx.select().from(table) returns a Drizzle SelectQueryBuilder as usual — live only.
- .withDeleted() appends a UNION ALL of live + archive rows. Archive-only columns (archived_at, deleted_at, deleted_by, archive_id, last_erasure_at) are projected as NULL for live rows. The UNION result preserves column order for stable ORDER BY.
- .onlyDeleted() queries the archive table directly. Default ordering: ORDER BY deleted_at DESC when no orderBy is specified.
- Both methods are type-safe: compile error if called on LiveOnlyTable.
- Helper functions exported: makeLiveOnly(table) to mark ad-hoc queries, and isSoftDeletable(table) runtime check.
- The internal archive-schema module (packages/data/src/internal/archive-schema) exposes an archiveOf(liveTable) resolver that returns the Drizzle schema for the mirror. Only this module can import from it; ESLint boundary rule enforces.

Tests:
- UNION ALL correctness: insert rows into both live and archive, run .withDeleted(), assert set union. With orderBy desc(createdAt), assert stable ordering across the UNION.
- Type safety: /// @ts-expect-error cases for LiveOnlyTable.
- RLS: verify that withDeleted() returns only the current tenant's rows from archive.

Success criteria:
- Queries compile and type-check.
- withDeleted runtime behavior matches the specification.
- Reading archive types is only possible through the internal module; direct import fails the ESLint rule.

Verification:
- pnpm --filter @stynx/data test green; tsc --noEmit green with the @ts-expect-error cases.
```

### Prompt 12 — migration-linter Tool

```
Read SPEC §13.5, §14 (invariant I8), SPEC §17.4.

Create tools/migration-linter as a standalone CLI (invokable as `stynx-migration-lint` from @stynx/cli later).

Deliverables:
- Command: stynx-migration-lint <migration-file-or-dir>.
- Parses SQL files using pg-query-emscripten or libpg_query (best), falling back to regex for simple cases.
- Lint rules (each emits a stable error code):
  - LINT001: Every new tenant-scoped table (has tenant_id column) must have RLS enabled and a tenant_isolation policy in the same migration.
  - LINT002: Every soft-deletable new table must declare its archive.{schema}_{table} mirror in the same migration. Creation via data.create_soft_deletable_table() satisfies this.
  - LINT003: ALTER TABLE on a soft-deletable live table must be mirrored via data.alter_soft_deletable_table() or an explicit paired ALTER on the archive.
  - LINT004: Every FK to a soft-deletable parent must carry `-- @softdelete_fk: hide | cascade | block` annotation. Missing annotation => error.
  - LINT005: DROP TABLE / TRUNCATE / DROP COLUMN on a non-empty-history table without `-- @destructive: approved-by=<ticket>` comment => error.
  - LINT006: SECURITY DEFINER without platform-architect approval stamp (detect via migration commit metadata or an explicit comment `-- @security-definer-approved: <name>/<ticket>`).
  - LINT007: GRANT statement targeting stynx_app on an audit.* table (audit tables are SELECT-only to stynx_app).
  - LINT008: Archive naming collision — two tables would produce the same archive.{schema}_{table}.
  - LINT009: `hide` annotation on a NOT NULL FK column (hide requires nullable).
- Each rule tested with at least one positive and one negative SQL fixture.
- CLI flags: --format=json|human, --fix-suggestions (emits SQL diffs for auto-fixable rules, currently LINT001 policy insertion and LINT002 data.create_soft_deletable_table wrapping).
- Exit code: 0 clean, 1 lint failures, 2 parser errors.

Success criteria:
- Run against ./specs/STYNX-REFERENCE-MIGRATION.sql and report clean.
- Synthetic bad migrations trigger the expected lint codes.

Verification:
- pnpm --filter tools/migration-linter test green. CLI runs against repo migrations without false positives.
```

### Prompt 13 — @stynx/tenancy

```
Read SPEC §4 in full (tenancy resolution, lifecycle, cross-tenant operations).

Create packages/tenancy.

Deliverables:
- StynxTenancyModule.forRoot({ headerName: 'X-Tenant-Id', allowSubdomain: boolean, subdomainPattern?: RegExp }).
- TenantContextInterceptor running after @stynx/core's RequestContextInterceptor. Resolves tenant per SPEC §4.2 order: header > bearer claim > subdomain. Validates UUIDv7. On resolution, sets TenantContext via CLS.
- Membership validation: after resolving tenantId, queries auth.memberships to confirm the caller is an active member. If not, throws ForbiddenException('TENANT_ACCESS_DENIED'). Uses a short-lived per-pod LRU cache to absorb hot path (TTL 5s).
- TenancyService with operations from SPEC §4.5:
  - provisionTenant(dto): runs the saga — INSERT tenancy.tenants (state=provisioning), create default roles (owner/admin/member/viewer), mint owner membership (pending), ensure S3 prefix (via @stynx/storage when available; mock for now), send invite via Cognito admin API (stub interface; @stynx/auth wires later), COMMIT and flip to active. Idempotent on retry by slug.
  - suspendTenant(id, reason): flips is_active=false, writes audit.system_op. Returns count of affected active sessions for the session-revocation follow-up (handled by @stynx/sessions in Prompt 14).
  - archiveTenant(id): exports, blocks access. Export is a stub that writes a placeholder file to S3; real export lives in @stynx/privacy.
  - purgeTenant(id): delegates to @stynx/privacy (stub interface).
- Platform admin endpoints: POST /tenants, GET /tenants, GET /tenants/:id, PATCH /tenants/:id, POST /tenants/:id/suspend, etc. All gated by @Permission('platform:tenants:*:*'), which is resolved once @stynx/auth lands (Prompt 15). For now, a simple env-flag admin check with a TODO.

Tests:
- Interceptor resolves tenant from all three sources correctly, rejects unknown tenants, rejects tenants where caller has no active membership.
- Provisioning is idempotent under concurrent identical calls.
- Suspension flips is_active and queries the live tables stop returning rows.

Success criteria:
- Request with valid X-Tenant-Id and valid membership passes through.
- Request with wrong tenant returns 403.
- Request without tenant header and no subdomain fails with a clear error message.

Verification:
- Integration tests green against a seeded two-tenant fixture.
```

---

## Phase 4 — Sessions and Auth

### Prompt 14 — @stynx/sessions

```
Read SPEC §5 (Auth tokens), §12 (Sessions), ADR-002 §2.7 (secondary Redis indexes).

Create packages/sessions.

Deliverables:
- SessionStore interface with Redis implementation. Session record shape per SPEC §5.4.
- SessionService operations:
  - create(userId, tenantId, cognitoSub, deviceMeta): mints sid (uuidv7), access token (10 min JWT signed with STYNX keypair), refresh token (opaque, 24h sliding), stores in Redis with TTL = absExpires. Maintains secondary indexes sessions_by_user:{uid} and sessions_by_tenant:{tid}.
  - refresh(refreshToken): rotates. Old refresh must not have been used before; reuse detection kills the entire session family (all sessions with the same refresh_family_id).
  - revoke(sid), revokeAllForUser(userId), revokeAllForTenant(tenantId): remove from Redis + emit perms:invalidate event (coordinated with @stynx/auth in Prompt 15).
  - get(sid), touch(sid) for idle-timeout sliding.
- STYNX JWT signing service using an RS256 keypair stored in Secrets Manager with quarterly rotation and an overlap window. JWKS endpoint at /.well-known/jwks.json (mounted by forRoot).
- auth.sessions table append-only mirror: on create/revoke, write a row (via @stynx/data tx). Partitioned monthly.
- Web storage contract documented: access token in memory, refresh token in sessionStorage (enforced by @stynx-web/angular-auth in Prompt 27; this package documents the expectation).

Tests:
- Create/get/revoke round trip.
- Refresh rotation: valid rotation, reuse detection kills family (assert all children revoked).
- Absolute + idle timeout enforcement.
- Tenant revocation: creates 3 sessions for tenant T, revoke all, confirm all dead within 100ms of the PUBSUB event propagation.
- Clock skew: JWT with nbf slightly in future behavior.

Success criteria:
- Session created can be validated via /.well-known/jwks.json publicly.
- Reuse detection is airtight — no way to use an old refresh after rotation.
- Revocation is O(K) via secondary indexes, not O(N).

Verification:
- pnpm --filter @stynx/sessions test:int green. Load test with 1000 refresh cycles completes without leaks.
```

### Prompt 15 — @stynx/auth (Cognito + Guards + Permission Engine)

```
Read SPEC §5 (Auth), §6 (Authorization), ADR-002 in full, STYNX-REFERENCE-MIGRATION.sql §5.

Create packages/auth.

Deliverables:
- CognitoJwtValidator: validates incoming Cognito access tokens via JWKS (cached 12h, refresh on kid miss). Uses jose library.
- POST /sessions handler: accepts Cognito JWT + X-Tenant-Id, validates, loads user + membership, mints STYNX session via @stynx/sessions. Issues (access, refresh) response.
- POST /sessions/switch handler per SPEC §5.5.
- POST /sessions/logout handler.
- StynxAuthGuard: validates STYNX access tokens on every request via the JWKS endpoint of @stynx/sessions. Populates ActorContext in CLS.
- @Permission(key) decorator + guard: enforces the permission check against the resolved permission set from the cache (see below). @Public(), @System(), @ReadOnly() decorators bypass or modify the check.
- PermissionCache service implementing ADR-002:
  - Three-tier: in-pod LRU (5s TTL, max 10k entries) -> Redis perms:{sid} -> DB fallback.
  - Hash probe: batched lookup of auth.memberships.effective_hash for (user, tenant) with 1s in-pod TTL.
  - Pub/sub subscriber: listens on perms:invalidate, drops matching cache entries.
  - Metric: perms_cache_hit_total{tier} emitted.
- EffectiveHashComputer: called by every permission-affecting mutation path. Enumerates per ADR-002 §2.6:
  1. auth.membership_roles mutations
  2. auth.direct_perms mutations
  3. auth.group_memberships mutations
  4. auth.role_perms mutations (affects all memberships using affected roles)
  5. auth.group_roles mutations
  6. platform role changes
  Each path must recompute and UPDATE auth.memberships with new hash + incremented generation in the SAME DB transaction as the original mutation.
- Admin API: GET /_platform/perms/:sid (inspect), POST /_platform/perms/:sid/invalidate.
- stynx doctor hook: a check function that enumerates AuthService methods and verifies the set matches the expected six paths from ADR-002.

Tests:
- All eight mandatory tests from ADR-002 §5.
- Cache hit rates at each tier observable via metric.

Success criteria:
- Adding a permission via admin API causes the user's next request to see it within 2s.
- Missing pub/sub event: hash probe still detects staleness and recomputes.
- @Permission('doc:read:*') is the only gate on a route — no other explicit authz check needed.

Verification:
- Coverage 95%+. All tests green. Load test with 1000 rps sustained shows p99 authz overhead < 2ms.
```

---

## Phase 5 — Audit and Storage

### Prompt 16 — @stynx/audit

```
Read SPEC §9 (in full), STYNX-REFERENCE-MIGRATION.sql.

Create packages/audit.

Deliverables:
- audit.fn_row_change() trigger function finalized (was stubbed in Prompt 8). Reads SET LOCAL app.* GUCs. Implements:
  - On live tables: normal row-change audit with op I/U/D.
  - Soft-delete detection: when app.archive_move = 'in_progress' and app.archive_reason = 'soft_delete', DELETE writes op=D with tags {soft_delete, archived, archive_table}. INSERT on archive writes nothing (suppression).
  - Restore detection: symmetric for app.archive_reason = 'restore'.
  - Hard delete: standard op=D, tags {hard_delete}.
  - Archive-direct ops: no GUC set, fire normally with tags {lgpd_erasure, strategy} or {hard_delete, from_archive}.
- audit.enable_for(table regclass) / audit.disable_for(table regclass, reason).
- StynxAuditModule with:
  - GET /_audit/log: platform-role gated, filters by tenant/actor/table/row/time-range. Pagination via cursor.
  - Read API respects archive retention policy (§9.4): LGPD-tagged partitions held 5 years, others 90 days online then detached to S3.
  - Detach job: scheduled daily, identifies partitions eligible for archival based on age + tag content (uses per-partition SELECT bool_or(...)). Detaches, pg_dumps to S3 under stynx-audit-{env}/{yyyy-mm}.sql.gz, drops.
- Testing utilities exported: a test helper expects audit rows of shape X within the running transaction (complements @stynx/testing's auditExpect in Prompt 20).

Tests:
- Soft-delete audit: one row per live DELETE, none per archive INSERT.
- Restore audit: one row per live INSERT, none per archive DELETE.
- LGPD erasure audit: archive trigger fires, op=U, tags include lgpd_erasure.
- Partition detach retains LGPD partitions longer (mock clock).

Success criteria:
- A soft-delete + restore cycle produces exactly two audit rows (D then I), tagged correctly.
- 5-year audit retention observable in the detach-job dry-run for a seeded LGPD-tagged partition.

Verification:
- Integration tests green against a sample tenant-scoped table.
```

### Prompt 17 — @stynx/storage

```
Read SPEC §8 (Storage), §14.10 (interaction with soft delete).

Create packages/storage.

Deliverables:
- S3Service: thin wrapper around @aws-sdk/client-s3. Enforces bucket naming from env (stynx-docs-{env}-{region}), per-tenant prefix, KMS key by alias.
- DocumentsService:
  - initiate(dto): authz'd via @Permission('document:write:*'), validates MIME allowlist per collection, size cap, classification default. INSERTs storage.documents with scan_status='not_scanned'. Returns presigned PUT URL (TTL 5min).
  - complete(id, headers): called by client after PUT. HEAD the object, verify content-type, verify SHA-256 header. MIME-sniff mismatch => quarantine: set scan_status='quarantined', soft-delete the registry row, audit.
  - getDownloadUrl(id): presigned GET, TTL <= 5min, tenant-match check.
  - softRemove / restore / hardRemove: use @stynx/data operations. On hard-delete-from-archive, @stynx/storage also issues S3 delete for the object and its versions.
- @stynx/storage pre-scan defenses (SPEC §8.3): MIME allowlist, size cap, content-type sniff, filename sanitization.
- storage.documents and related tables created via @stynx/data helpers (already in platform migrations from Prompt 8; wire up the archive mirror).
- Module exposes a configurable collections registry (from app code): each collection has mime_allowlist, max_bytes, classification_default.

Tests:
- Presign PUT + actual upload + complete roundtrip using LocalStack.
- MIME mismatch triggers quarantine.
- Cross-tenant presign is rejected (attempt to presign a doc whose tenant_id != TenantContext.tenantId).
- Hard delete from archive removes both the registry row and all S3 versions.

Success criteria:
- A file uploaded via presign flow is downloadable via presign flow.
- No code path in @stynx/storage permits the consumer to bypass the tenant prefix.

Verification:
- Integration with LocalStack green. Load test: 100 concurrent presign ops complete p99 < 50ms (matches §26 SLO).
```

---

## Phase 6 — Utility Packages

### Prompt 18 — @stynx/ratelimit

```
Read SPEC §15.

Create packages/ratelimit.

Deliverables:
- Four-dimensional sliding-window limiter in Redis via Lua script for atomicity. Order: IP -> tenant -> user -> route-per-tenant.
- @RateLimit({ bucket, scope, cost? }) decorator + guard. Bucket identifies which dimension; scope is the namespace key.
- Per-tenant tier defaults in core.config; per-tenant overrides in core.rate_limit_overrides (SPEC §7).
- Response headers on all responses: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After on 429.
- Cost weighting (cost: N tokens per call for expensive endpoints).
- Bypass for @System() routes.
- Metric: ratelimit_block_total{scope} increments on 429.

Tests:
- Burst within window: allowed up to limit, blocks above.
- Cost weighting: a cost=5 call consumes 5 tokens.
- Per-tenant override: higher tier lets more through.
- Lua atomicity: 1000 concurrent hits against a limit=100 bucket produces exactly 100 allowed + 900 blocked.

Success criteria:
- p99 overhead <1ms per request (SPEC §26).
- No race conditions under load.

Verification:
- Load test with k6: 5000 rps against a limit=100/min bucket, confirm ratio.
```

### Prompt 19 — @stynx/idempotency

```
Read SPEC §22, SPEC §15 (related response-header conventions).

Create packages/idempotency.

Deliverables:
- @Idempotent(headerName?) decorator. Default header: 'Idempotency-Key'. Required on annotated routes.
- Idempotency interceptor:
  - On entry: compute key = hash(tenant_id, user_id, route, idempotency_header_value). Check Redis + core.idempotency_keys (durable).
  - If hit: return stored response unchanged with header Idempotency-Replayed: true.
  - If miss: acquire Redis lock on key (SET NX PX), proceed. On response, store body+status+relevant headers with TTL 24h default (configurable per route). Release lock.
  - On concurrent in-flight requests with same key: block on lock, return same eventual response.
- Body mismatch detection: if replay's request body hash differs from stored, return 422 IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY.
- 5xx responses NOT stored (retry allowed). 4xx stored.
- Metric: idempotency_replay_total.
- ESLint rule: POST/PUT/PATCH routes without @Idempotent or @NoIdempotent emit a warning (not error) per SPEC §22.3.

Tests:
- Hit: second call returns first call's exact response.
- Miss with concurrent requests: both receive same response; one is the original, one is a replay.
- Body mismatch: 422.
- 5xx response replay: lock released, retry allowed.

Success criteria:
- Stripe-compatible semantics verified against Stripe's test matrix (where applicable).
- p99 lookup overhead <5ms (SPEC §26).

Verification:
- Integration tests green.
```

---

## Phase 7 — Testing Framework

### Prompt 20 — @stynx/testing

```
Read SPEC §16 (in full), SPEC §14.7 (FK behavior for matchers), ADR-001 §B.

Create packages/testing.

Deliverables:
- createTestApp({ migrations, seeds, overrides }): spins up a NestJS app with:
  - Testcontainers postgres:16 (ephemeral DB).
  - Testcontainers redis:7.
  - LocalStack for S3 and KMS stubs.
  - cognito-local or moto for Cognito.
  - Runs platform migrations + consumer migrations + seeds.
  - Returns the app + db + redis handles + teardown.
- withTenant(tenant, fn), withActor(user, fn): context helpers that elevate into a specific tenant/actor for the duration.
- Matchers (as Jest extensions or standalone helpers):
  - expectRLSIsolated(query, { tenantA, tenantB }): asserts query returns no tenantB rows when running under tenantA context.
  - expectROCannotWrite(fn): wraps fn in a reader-role tx, asserts any write throws ReadOnlyViolationError.
  - auditExpect(entity, op, { tags? }): asserts an audit row exists matching the criteria, including tag subset matching.
  - expectInArchive(liveTable, id): row exists in archive.{schema}_{table}.
  - expectNotInLive(liveTable, id): row absent from live.
  - expectRestored(liveTable, id): present in live, absent from archive.
  - expectArchiveMirrorExists(liveTable), expectArchiveMirrorInSync(liveTable): schema parity.
  - expectRestoreConflict(liveTable, id): calling restoreFromArchive throws 409.
  - expectSoftDeleteBlocked(liveTable, id): softDelete throws with blockingChildren list.
- Fixture factories for every STYNX table (tenancy, auth, storage). Consumer apps supply their own domain factories.
- Auth mocks: mintTestSession({userId, tenantId, perms[]}) that returns a valid STYNX JWT. Only available when NODE_ENV === 'test'.
- Doctor helper: runs the full 13-test invariant suite against a given consumer app (hook for stynx doctor CI gate).

Tests on the testing package itself: use the reference domain fixtures to exercise every matcher.

Success criteria:
- A consumer package can import @stynx/testing, call createTestApp, and have a fully-isolated app in <30 seconds.
- Every matcher has a positive and negative test case.

Verification:
- pnpm --filter @stynx/testing test green.
```

---

## Phase 8 — Privacy and i18n

### Prompt 21 — @stynx/privacy

```
Read SPEC §21 (in full), SPEC §14.9.

Create packages/privacy.

Deliverables:
- PII map loader: reads from core.pii_map (seeded by consumer apps' migrations) + optional YAML overrides under app/privacy/pii-map.yaml at boot. Validates entries.
- Export:
  - POST /privacy/exports {subject_user_id?, tenant_id?, format}.
  - Walks the PII map, extracts all subject-linked rows from both live and archive per the PII map's joins.
  - Zips to JSON/CSV, uploads to S3 stynx-privacy-{env}/exports/{export_id}.zip with 7-day lifecycle expiration.
  - Emits presigned download URL (7-day TTL).
  - Audited.
- Erasure:
  - POST /privacy/erasures {subject_user_id}.
  - Builds erasure plan from PII map (column -> strategy).
  - Executes per table: UPDATE nullify/hash_with_salt/tombstone, DELETE for delete_row. Runs on both live and archive.
  - Disables Cognito user (admin API).
  - Audited: writes audit row with tags {lgpd_erasure, strategy}. These land in the 5-year-retained partition.
  - Idempotent: re-running produces same end state.
- Retention:
  - Nightly job: applies active-row retention rules from PII map (e.g., "hard delete inactive work items after 7 years").
  - Operates under withSystemContext.
- ROPA generator: CLI command `stynx privacy ropa` emits Markdown ROPA from the PII map + data flow metadata (tenants, categories, processors).

Tests:
- Export produces a zip with expected contents for a seeded subject.
- Erasure strategies produce correct end-state per strategy. Archive rows processed.
- Retention dry-run reports expected actions; apply produces them.

Success criteria:
- LGPD Art. 16 compliance narrative supportable from audit + erasure records.
- Export + erasure both complete within LGPD's 15-day ceiling for a realistic fixture.

Verification:
- Integration tests green. Manual review of ROPA output against the reference domain.
```

### Prompt 22 — @stynx/i18n

```
Read SPEC §23.

Create packages/i18n.

Deliverables:
- Catalogs: ICU MessageFormat JSON per locale. Default locales pt-BR (primary) and en-US. Shipped per package (each @stynx/* package has packages/{name}/i18n/{locale}.json).
- Runtime catalog aggregator: at boot, walks every registered package's i18n directory, merges into one catalog per locale. Tenant overrides loaded from tenancy.tenant_settings (key prefix "i18n.override.") and layered on top.
- LocaleResolver: per SPEC §23.1 order (session preference > Accept-Language > tenant default > platform default pt-BR). Populates RequestContext.locale.
- t(key, vars?, locale?) function: ICU evaluation via @formatjs/intl-messageformat.
- Error i18n: StynxError subclasses carry a message key (e.g., 'auth.session.expired'); the error filter looks up localized text based on RequestContext.locale at response time. Structured code always accompanies the human message.
- Tenant catalog override admin API: GET/PUT /_tenancy/i18n/overrides (admin-only per tenant).

Tests:
- Resolution order respected.
- Tenant override beats platform catalog for matching key.
- ICU plural / gender correctness for pt-BR and en-US.
- Error response includes {code, message (localized), details}.

Success criteria:
- Adding a new key to any @stynx/* package's pt-BR catalog is picked up at next boot.
- Missing key falls back to en-US then the key string, never throws.

Verification:
- Tests green. Manual: switch Accept-Language and confirm error messages localize.
```

---

## Phase 9 — CLI

### Prompt 23 — @stynx/cli (init, migrate, doctor)

```
Read SPEC §20 (Bootstrapping & Adoption), §17.2 (PR gates).

Create packages/cli as a NodeJS CLI (commander or oclif).

Deliverables:
- stynx init <app-name> [--angular]:
  - Scaffolds a consumer NestJS app pre-wired with every @stynx/* package, Dockerfile, docker-compose.yml for local PG+Redis+LocalStack+cognito-local, .env.example, CODEOWNERS stub, README.
  - One example tenant-scoped + soft-deletable module + migration using data.create_soft_deletable_table. Tests passing out of the box.
  - CDK stack skeleton under infra/ mirroring STYNX-CDK-SKELETON.md.
  - --angular flag scaffolds an Angular workspace with @stynx-web/angular pre-wired (Prompt 26 fills in).
- stynx migrate up|down|status|redo:
  - Runs Drizzle Kit-generated migrations plus custom platform migrations.
  - Status shows current state.
  - Supports dry-run via --dry.
- stynx doctor:
  - Runs the 13 mandatory test families check + all invariant lints (I1-I8) + migration-linter against all migrations + stynx-audit style checks.
  - Aggregates into a single compliance report.
  - Exit 0 clean, 1 violations, 2 infrastructure failure.
- stynx privacy ropa (from Prompt 21; just wire the command here).
- Shell completion: bash, zsh, fish.

Tests:
- init against a tempdir produces a buildable consumer app.
- migrate up followed by migrate status reports all platform migrations applied.
- doctor against a known-clean fixture: exit 0.
- doctor against a known-violations fixture: exit 1 with correct codes enumerated.

Success criteria:
- `stynx init testapp && cd testapp && pnpm install && pnpm test` succeeds end to end.
- stynx doctor integrated into CI (Prompt 3 workflow updated to call it).

Verification:
- Manual: run `stynx init` against /tmp, verify scaffold works.
```

### Prompt 24 — @stynx/cli (adopt subcommands)

```
Read SPEC §20.2, STYNX-ADOPT-EXAMPLE.md (in full).

Extend @stynx/cli with the adopt subcommand family.

Deliverables:
- stynx adopt scan: produces a compliance report matching STYNX-ADOPT-EXAMPLE.md §2. Format JSON + human output.
- stynx adopt apply [--dry-run]: runs codemods.
  - Replace pg.Pool / pg.Client usages with @stynx/data Database DI.
  - Wrap raw query/execute calls in trx.execute / trx.select.
  - Replace bespoke JWT middleware with @stynx/auth guards.
  - Insert @Permission(TODO_PERMISSION) on routes lacking permission.
  - Introspect information_schema and emit Drizzle schema files.
  - For each tenant-scoped table missing archive mirror: generate migration calling data.create_soft_deletable_table (or data.adopt_soft_deletable_table if the table has ad-hoc deleted column).
- stynx adopt apply-proposed-permissions: second-pass codemod that replaces TODO_PERMISSION with the permission keys decided in phase 3.
- stynx adopt link-cognito-users --dry-run: matches auth.users rows to Cognito subs based on email; reports unmatched.
- All codemods idempotent — re-running is safe.

Tests:
- Use a fixture consumer repo (packages/cli/test/fixtures/adoption-fixture) that mirrors STYNX-ADOPT-EXAMPLE.md before state. Run adopt scan + apply, assert the after state matches expected snapshots.
- TODO_PERMISSION sentinel: CI fails on any occurrence.

Success criteria:
- Running full adopt sequence on the fixture produces a compliance-green result.

Verification:
- pnpm --filter @stynx/cli test:adopt green.
```

---

## Phase 10 — Frontend Packages

### Prompt 25 — @stynx-web/sdk

```
Read SPEC §18 (Frontend Packages), STYNX-API-DATA.md (for shape cross-reference).

Create packages-web/sdk.

Deliverables:
- Framework-agnostic TypeScript HTTP client.
- Generated from OpenAPI spec emitted by @stynx/core (add to @stynx/core a @stynx:emit-openapi build step; if not present from earlier prompts, add it here).
- Generation via openapi-typescript-codegen or openapi-generator-cli with typescript-fetch template. Consumer-agnostic.
- Regeneration is a build step: pnpm --filter @stynx-web/sdk codegen reads openapi.json (from @stynx/core's build output) and regenerates src/.
- Hand-coded supplements (not generated, but included):
  - Typed error classes mapping server StynxError codes to client types.
  - A pluggable AuthProvider interface (getAccessToken(), refresh(), onAuthFailure()).
  - A pluggable TenantProvider interface (getTenantId()).
  - An HTTP transport that injects Authorization: Bearer and X-Tenant-Id headers, handles 401-triggered refresh + replay.
- Package is pure TS; zero Angular deps.

Tests:
- Mocked HTTP transport, assert headers, 401 refresh behavior.
- Error code mapping from response to typed error instances.

Success criteria:
- A non-Angular consumer (Node script or React app) could import and use @stynx-web/sdk.

Verification:
- pnpm --filter @stynx-web/sdk build produces dist/ + codegen artifacts.
```

### Prompt 26 — @stynx-web/angular Core

```
Read SPEC §19 (in full).

Create packages-web/angular.

Deliverables:
- StynxAngularModule.forRoot({apiBaseUrl, cognito: {...}, sessionMode: 'bearer' | 'cookie'}).
- HTTP interceptors:
  - AuthInterceptor: injects STYNX bearer, handles 401-triggered refresh + replay via @stynx-web/sdk.
  - TenantInterceptor: injects X-Tenant-Id from TenantContextService.
  - RequestIdInterceptor: generates client-side request id and propagates.
  - ErrorInterceptor: maps error responses to typed errors, surfaces via ErrorBannerService.
- TenantContextService: reactive signal-based state (tenantId$, activeTenant$). Deep-link resolution on init (parse URL, subdomain, or default to first membership).
- Config via environment.ts + forRoot options. Strict CSP nonce support.
- Error UX services: ErrorBannerService, ToastService, EmptyStateComponent (in angular-ui but re-exported here).

Tests (Angular testing utilities + Jest):
- Interceptors: order preserved, headers correct, 401 refresh + replay behavior.
- TenantContextService: reactive updates, deep-link resolution.

Success criteria:
- An Angular consumer can import StynxAngularModule.forRoot({...}) and make authenticated requests without writing any interceptor code.

Verification:
- pnpm --filter @stynx-web/angular test green.
```

### Prompt 27 — @stynx-web/angular-auth

```
Read SPEC §5, §19.4.

Create packages-web/angular-auth.

Deliverables:
- Integrates angular-auth-oidc-client for Cognito OIDC PKCE flow.
- SessionService: login(), logout(), getAccessToken(), refresh(), active$ signal.
- Token storage: access in memory, refresh in sessionStorage (tab-scoped). Cookie mode as a forRoot option.
- AuthGuard (canActivate): checks active session, redirects to login if missing.
- PermissionGuard: canActivate(['perm:string']) validates against the session's resolved permission set (client side, decoded from JWT's perms_hash… note: client side is advisory only; server is authoritative).
- *hasPermission structural directive: *hasPermission="'document:write:*'" conditionally renders.
- Automatic tenant-switch flow: calls POST /sessions/switch, updates session, updates TenantContextService.
- UI stubs: <stynx-login-redirect> component (shown during OIDC round trip), <stynx-logout-button>.

Tests:
- PKCE flow end-to-end against cognito-local in CI.
- Permission guard denies/allows based on mock perms.
- Tenant switch updates both session and tenant context.

Success criteria:
- A fresh Angular app with StynxAngularAuthModule can log in via Cognito and access permission-gated routes.

Verification:
- Component tests + e2e green.
```

### Prompt 28 — @stynx-web/angular-storage, angular-sessions, angular-profile

```
Read SPEC §8.3 (upload flow), §12 (sessions UI), §19.

Create three frontend packages in one PR (each is small).

Deliverables for angular-storage:
- <stynx-document-upload [collection] [allowedMimes] [maxBytes] (completed)="..."> component. Implements presigned PUT flow with progress bar, retry on transient failure, MIME + size client-side validation (re-enforced server-side).
- DocumentService: initiate(), complete(), getDownloadUrl(), list().

Deliverables for angular-sessions:
- <stynx-active-sessions> component: lists sessions for current user, allows revoke per session or revoke all other sessions. Uses platform-scoped or tenant-scoped view depending on caller role.

Deliverables for angular-profile:
- <stynx-profile-form> component: name, email, locale preference.
- <stynx-preferences-form> component: i18n locale override, notification toggles (stubbed; extensible via slot projection).

Shared: angular-ui (from Prompt 30) provides <stynx-banner>, <stynx-toast-container>, <stynx-empty-state>, <stynx-pagination>, <stynx-table> primitives used by all three.

Tests:
- Upload: mock presigned URL flow, verify 3-state transitions (initiating, uploading, completed/errored).
- Sessions revoke: integrates with SessionService from @stynx-web/angular-auth.
- Profile form: validation + dirty state.

Success criteria:
- Reference-web app (Prompt 32) uses all three without writing UI code.

Verification:
- Component tests green in Angular.
```

### Prompt 29 — @stynx-web/angular-trash, angular-i18n, angular-ui

```
Read SPEC §14.10, §23, §19.2 (angular-ui).

Create three packages.

Deliverables for angular-ui:
- Shared Angular Material primitives: <stynx-banner>, <stynx-toast-container>, <stynx-empty-state>, <stynx-pagination>, <stynx-table>, <stynx-loading-spinner>, <stynx-confirm-dialog>.
- All theme-aware via Angular Material tokens.

Deliverables for angular-trash:
- <stynx-trash-list [resource] [columns]> component. Generic; parameterizable by resource type.
- Actions: restore, hard-delete (only if user has permission), restore-with-cascade when the server's 409 response indicates archived children.
- Empty state, pagination, sort by deleted_at DESC by default.

Deliverables for angular-i18n:
- StynxI18nModule.forRoot({ defaultLocale, loadCatalog: (locale) => Promise<Catalog> }).
- @ngx-translate/core or custom ICU bridge — pick one (ngx-translate with an ICU plugin is acceptable).
- Runtime locale switch without reload: updates all subscribers.
- LocaleSwitcherComponent.

Tests:
- angular-trash: soft-delete a fixture, open trash list, restore, assert round-trip visually (snapshot or minimal assertion).
- angular-i18n: switch locale mid-session, assert UI text changes.

Success criteria:
- Reference-web uses these components to deliver a trash view, a locale switcher, and uniform error banners.

Verification:
- Component tests green.
```

---

## Phase 11 — Reference Applications

### Prompt 30 — reference/api

```
Read SPEC §3 (reference/api), STYNX-REFERENCE-MIGRATION.sql.

Create reference/api — the reference NestJS app exercising every @stynx/* package.

Deliverables:
- The sample.* domain from STYNX-REFERENCE-MIGRATION.sql (`record`, `record_note`, `work_item`, `work_item_entry`, `work_item_lock`) as the implemented domain.
- Full CRUD controllers, services, DTOs for each entity.
- Every FK annotation exercised (cascade, block, hide).
- @Permission, @Audit, @RateLimit, @Idempotent, @ReadOnly decorators used correctly across the surface.
- Migration under reference/api/migrations/ matching STYNX-REFERENCE-MIGRATION.sql.
- Dockerfile + docker-compose.yml for local dev stack.
- README with how to run locally, how to run tests, how to invoke common operations.

All mandatory tests from SPEC §16.3 (13 families) present and passing.

Success criteria:
- `pnpm --filter @stynx/reference-api test` green.
- `stynx doctor` against this app: exit 0, compliant.
- Docker stack `docker compose up` yields a working API reachable on localhost:3000.

Verification:
- Manual: exercise a soft-delete cascade (delete a record with work items), observe 409 from block, then clear the blocking work-item locks and re-try.
```

### Prompt 31 — reference/web

```
Read SPEC §3 (reference/web), §19.

Create reference/web — the reference Angular app.

Deliverables:
- Angular 18 workspace using @stynx-web/angular + all sub-packages.
- Pages: login, tenant selection, dashboard, records (list + detail + create + edit), work-items (list + detail + create + transition), trash.
- Every page uses @stynx-web/* components; minimal custom UI code.
- Error banner + toast container mounted globally.
- Locale switcher in toolbar.
- e2e tests via Playwright: login -> create record -> create work-item -> soft-delete -> restore -> logout. Runs in CI against reference-api.
- Dockerfile for production build.

Success criteria:
- `pnpm --filter @stynx/reference-web build` produces a deployable dist.
- Playwright e2e green against dockerized reference-api + reference-web.

Verification:
- Manual: run both apps locally, walk the full user flow including a cascade-delete confirmation dialog.
```

---

## Phase 12 — Infrastructure

### Prompt 32 — CDK: Network + Identity + Data Stacks

```
Read STYNX-CDK-SKELETON.md §3-5.

Create infra/ at the repo root. Package infra/cdk as a standalone TS project (not part of the pnpm workspace — avoid deps confusion).

Deliverables:
- bin/stynx-env.ts entry point per §2.
- lib/config/{dev,stage,prod}.ts per §2.
- lib/network-stack.ts per §3.
- lib/identity-stack.ts per §4.
- lib/data-stack.ts per §5.
- Unit tests via aws-cdk-lib/assertions: template matches expected resources (counts, key properties).
- cdk synth against a dev config produces valid CloudFormation templates.

Success criteria:
- `cd infra/cdk && npm install && cdk synth -c env=dev` succeeds.
- Resources created match the skeleton documented in STYNX-CDK-SKELETON.md.

Verification:
- CDK snapshot tests green. cdk diff against an existing deployment (if any) reviewable.
```

### Prompt 33 — CDK: Storage + Compute + Observability Stacks

```
Read STYNX-CDK-SKELETON.md §6-8.

Extend infra/cdk with the remaining stacks.

Deliverables:
- lib/storage-stack.ts per §6.
- lib/compute-stack.ts per §7, including:
  - ECS Fargate task definition referencing an image tag passed via context (CI provides).
  - WAF with managed rule groups.
  - ACM cert referenced by ARN from config.
  - Health check path /readyz.
- lib/observability-stack.ts per §8, including AMP + AMG + baseline alarms + SNS topic for alerts.
- cdk synth against dev/stage/prod configs.

Success criteria:
- All six stacks compose cleanly; cross-stack imports resolve.
- Synth produces < X MB of CloudFormation (reasonable sanity check).

Verification:
- `cdk synth -c env=prod` succeeds.
- Manual: review generated templates against the skeleton document.
```

---

## Phase 13 — Hardening and Release

### Prompt 34 — Load Tests with k6

```
Read SPEC §16.1 (Load layer), SPEC §26 (SLOs).

Create a k6 load test suite under test/perf/k6/.

Deliverables:
- Scenarios:
  - auth.js: login flow, sustained 100 rps for 5 min.
  - crud.js: record CRUD at 500 rps for 10 min against reference-api.
  - upload.js: document upload (presign + PUT) at 50 rps for 5 min.
  - cascade-delete.js: soft-delete with cascade for realistic fixtures.
- Assertions on SLOs:
  - auth token verify p99 < 10ms
  - data tx overhead p99 < 2ms
  - storage presign p99 < 50ms
  - ratelimit overhead p99 < 1ms
  - idempotency lookup p99 < 5ms
- Results published as HTML via k6's built-in handler.
- Docker-compose override to spin up the full reference stack for perf runs.
- CI job: weekly (scheduled) + manual dispatch. Not on every PR.

Success criteria:
- All SLO assertions pass against a fresh reference stack on a standard CI runner.
- Degradation on the primary branch > 10% over last run fails the job.

Verification:
- `k6 run test/perf/k6/crud.js` locally green against docker-compose.
```

### Prompt 35 — Mutation Tests with Stryker

```
Read SPEC §16.1 (Mutation layer).

Add Stryker mutation testing for the three highest-risk packages: @stynx/auth, @stynx/tenancy, @stynx/data.

Deliverables:
- stryker.conf.mjs per package (or one shared config with package overrides).
- Mutation score thresholds: @stynx/auth >= 85, @stynx/data >= 85, @stynx/tenancy >= 80.
- Incremental mode enabled for PR speed; full runs scheduled nightly.
- CI job: weekly + manual dispatch.
- Report published as HTML artifact.

Success criteria:
- Mutation runs complete in < 30 min on CI for all three packages combined.
- Thresholds met on initial run.

Verification:
- `pnpm --filter @stynx/data stryker run` green.
```

### Prompt 36 — Documentation Site with Docusaurus

```
Read SPEC §20.3.

Create docs/ as a Docusaurus site.

Deliverables:
- Auto-generated API reference from TypeDoc for every @stynx/* and @stynx-web/* package.
- Narrative docs aggregated from:
  - Each package's README.md.
  - specs/ (rendered as a "Specifications" section).
  - ADRs (rendered as an "Architecture Decisions" section).
  - Adoption guide (from STYNX-ADOPT-EXAMPLE.md).
  - Infrastructure guide (from STYNX-CDK-SKELETON.md).
- Search (Algolia or offline-index).
- Versioning: one version per @stynx/core major.
- Deploys to GitHub Pages on merge to main (gated on CI green).

Success criteria:
- `pnpm --filter docs build` produces static site.
- Every exported symbol in @stynx/* packages has API-ref coverage.

Verification:
- Lighthouse audit on the built site scores > 90 on performance and accessibility.
```

### Prompt 37 — v1.0 Release Preparation

> Scope revision, 2026-04-27: AWS/ECR push and Cosign signing are no longer
> required to close Prompt 37. The v1.0 release-artifact gate is secretless:
> build the reference container images in GitHub Actions, generate Syft SBOMs,
> and upload the SBOMs plus Docker image metadata as workflow artifacts.

```
Final prompt. Read SPEC §17.3 (Release), §25 (Security Posture), §26 (Versioning).

Prepare the v1.0 release.

Deliverables:
- Changeset stub for v1.0.0 on every package. All marked major (breaking from pre-1.0 semantics).
- Security review checklist completed:
  - SAST clean (Semgrep).
  - `npm audit` / `pnpm audit` clean for high/critical.
  - Container scan clean (Trivy) for all produced images.
  - Every package exports a single barrel; no deep imports accepted.
  - Every public function is documented via TSDoc.
  - License: per-package LICENSE file matches the repo's top-level choice.
- All SLOs from SPEC §26 verified via the k6 suite.
- stynx doctor against reference/api and reference/web: exit 0.
- Architecture Decision Log published as part of the docs site.
- GitHub Release drafts prepared for each package with changeset-generated notes.
- SBOM (Syft) attached to every release artifact.
- Docker image metadata attached for every produced reference image.

Release automation:
- Changesets release PR prepared and reviewable for the 1.0.0 version bump.
- Release workflow owns package versioning. Registry publishing is opt-in via
  `STYNX_ENABLE_REGISTRY_PUBLISH=true` plus an appropriate `NPM_TOKEN` after
  package namespace ownership is configured.
- Reference Docker images built in GitHub Actions. Registry push/signing is
  deferred until AWS/ECR/Cosign environments are configured.

Post-release:
- Update README.md top-level: "STYNX v1.0 — Shipped".
- Open an issue "v1.1 planning" seeded with the SPEC §24 deferred extensions list.

Success criteria:
- CI green on main.
- Release Prep and Release workflows green on main.
- Release notes prepared and reviewable.
- Release Artifacts uploads Syft SBOMs and Docker image metadata.

Verification:
- Install one of the built packages into a fresh project, confirm it works.
- stynx init TestApp against the prepared release packages, confirm scaffolded
  app builds and passes tests.
```

---

## Summary

37 numbered prompts covering the complete v1.0 implementation, plus Prompt 0 for the initial audit. Total estimated agent-sessions: **38**.

### Suggested execution pattern

- **Weeks 1–2:** Prompt 0 (audit), Prompts 1–3 (tooling). One engineer driving.
- **Weeks 3–6:** Prompts 4–13 (core + data). Bulk of the architectural work.
- **Weeks 7–10:** Prompts 14–19 (auth, audit, storage, utility).
- **Weeks 11–12:** Prompts 20–22 (testing, privacy, i18n).
- **Weeks 13–14:** Prompts 23–24 (CLI).
- **Weeks 15–18:** Prompts 25–29 (frontend).
- **Weeks 19–20:** Prompts 30–31 (reference apps).
- **Weeks 21–22:** Prompts 32–33 (infra).
- **Weeks 23–26:** Prompts 34–37 (hardening + release).

### How to use

Feed prompts one at a time to the agentic coding tool. Each prompt produces a PR; review, merge, proceed to the next. The agent reads `./specs/` at the start of each prompt session — that context is free‑to‑load given they're static files in the repo.

If an agent session runs long on a prompt, split it at natural seams (e.g., Prompt 10 could split into "softDelete + hardDelete" and "restore + restoreWithCascade"). Keep the PR granularity in line with reviewer sanity: roughly < 2000 lines diff per PR ideal, < 5000 lines tolerable, > 5000 lines split.

When a prompt's success criteria can't be met, the agent surfaces the blocker in the PR description rather than force a compromise. Reviewers decide whether to adjust the prompt, amend the spec, or accept scope narrowing.

_End of prompt sequence._
