---
adr_id: ADR-DEVAI-ADOPTION-0027
title: STYNX adopts the app.* GUC dialect and deny-by-default boundaries for itself (S10 SM-05, SM-12)
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, devai, rls, lint, adoption]
---

# ADR-DEVAI-ADOPTION-0027 — app.* GUC dialect and deny-by-default boundaries (SM-05, SM-12)

**Status:** Accepted.
**Authority:** Owner approval on 2026-10-23 of the S10 plan with the recommended option for every decision (O-1 (a) through O-10), and the Owner's go-ahead for the combined SM-05 + SM-12 change (O-7 (b)).
**Context:** Foundation D-064 (P-8-03 (a)) makes SM-05, SM-09, SM-11 and SM-12 the rows that gate STYNX's own DEVAI 3 adoption; they follow the STYNX 3.0.0 release ([ADR-RELEASE-0006](2026-10-22-stynx-3.0.0-sm-21-release.md)). This record covers SM-05 and SM-12. SM-09 and SM-11 land separately. No release is part of this change (O-8 (a)): it rides the next fixed-group release.

## Findings that shaped the change

Both rows' ledger acceptance commands passed before any work, without proving anything:

- **SM-05.** The `pg_policies` query for `current_setting('auth.|stynx.…')` returned 0 on a database reset through `scripts/db-reset.sh`, yet all 8 bootstrap policies called the helpers `auth.current_tenant()` and `auth.has_role()`, which read `auth.*` and then `stynx.*`. `audit.fn_log_dml` read `stynx.correlation_id`, and the setters `auth.set_tenant` and `auth.set_user_context` wrote `auth.*`. LINT011 scans only policy text, and `lint:repo` never linted `database/`.
- **SM-12.** With `default: 'disallow'` and an empty allow list, a workspace-wide lint reported 0 `boundaries/*` findings. STYNX source crosses packages only through `@stynx-nyx/*` package names, which `eslint-plugin-boundaries` classifies as external and never checks; STYNX has no relative cross-package import.

## Decision

### SM-05 — the bootstrap layout reads and writes only app.*

1. `database/ddl/*` is applied history and is not edited (D-033, D-059 P-7-04 (c)). The new [`database/migrations/001_app_guc_context.sql`](../../database/migrations/001_app_guc_context.sql) redefines, with the same signatures:
   - `auth.current_tenant()`, `auth.current_user_id()` and `auth.current_roles()` to read `app.tenant_id`, `app.actor_id` and `app.roles`;
   - `auth.set_tenant` and `auth.set_user_context` to write `app.tenant_id`, `app.actor_id`, `app.roles` and `app.lang`; both stay `SECURITY DEFINER` (approved under `platform-architects/S10-SM-05`) and now pin `search_path = pg_catalog`;
   - `auth.create_rls_policy` to emit direct `app.*` predicates;
   - `audit.fn_log_dml` to take the correlation id from `app.request_id`.
     It then recreates the 8 bootstrap policies with direct `current_setting('app.…')` predicates, so the `pg_policies` query and LINT011 both see what each policy reads.
2. The role source is a new `app.roles` setting, a comma-separated list of role codes (O-1 (a)). It is not `app.role`, which stays the single database role that `Database.tx` writes. Writers:
   - `@stynx-nyx/core`: `RequestContextState` and `RequestContextPatch` gain an optional `roles`;
   - `@stynx-nyx/auth`: `ActorContextInterceptor` patches the verified `roles` claim;
   - `@stynx-nyx/data`: `Database.tx` writes `app.roles` for app and reader transactions when the request carries roles;
   - `@stynx-nyx/backend`: `PgSessionDbContextApplier` adds `app.actor_id`, `app.roles`, `app.tenant_id`, `app.request_id` and `app.lang` to its default setting names. The legacy names stay, so the change is additive.
3. The bootstrap order is ddl, then `database/migrations`, then seed, as `database/README.md` already documented (O-2 (a)). `scripts/db-reset.sh` and the `test/db` runtime fixture now apply `database/migrations`. `verify-db-acceptance.mjs` reads `dbAcceptance.migrationPaths`. `verify-rls-negative.mjs` and `check-rls-smoke.sh` cover the new file. `lint:repo` lints every file in `database/migrations` except the applied `000_migrate-check-preseed.sql`, whose comments are a LINT006 false positive and whose bytes cannot change.
4. **Extended acceptance** (supersedes the ledger's single query for SM-05). After ddl, migrations and seed, all of these hold:
   - the `pg_policies` query for legacy reads returns 0;
   - `pg_proc` bodies in `auth`, `audit` and `storage` matching `current_setting\('(auth|stynx)\.` return 0 (readers);
   - the same bodies matching `set_config\('(auth|stynx)\.` return 0 (writers);
   - every bootstrap policy reads `app.tenant_id` directly.
     `git diff --stat <base> -- database/ddl packages/data/migrations` is empty. `test/db/runtime/guc-dialect.runtime.spec.ts` asserts all of this, plus the behaviour: `app.*` scopes reads, `platform:superadmin` in `app.roles` bypasses, and the legacy settings grant nothing.
5. `stynx.seed_fixtures` and `stynx.audit_chain_key` remain. They are operational switches read inside function bodies of applied platform and reference migrations, not tenant context in policies.

### SM-12 — STYNX lints itself deny-by-default

1. The workspace profile ([`tools/eslint-config/workspace.mjs`](../../tools/eslint-config/workspace.mjs)) makes each of the 47 packages linted through a workspace entry point its own element. That is every `packages/*` and `packages-web/*` package, `tools/migration-linter`, `reference/api` and `reference/web`. The `apps/*` element, which matched nothing, is gone.
2. **Allow list (O-6 (a)).** The allow list is exactly the cross-package graph measured on 2026-10-23: 142 edges, all by package name. Adding an edge is a reviewed change to that file. Four edges point at a higher layer of the retired layer map (core, contracts, foundation, data, sessions, auth, platform, experience, tooling) and are allowed by name:
   - `auth` → `idempotency`;
   - `sessions` → `idempotency`;
   - `tenancy` → `data`;
   - `tenancy` → `idempotency`.
     The 14 packages the old map never classified, the web packages and the reference apps keep exactly the edges they have today. Tightening the layering is later work, not part of S10.
3. **Resolution.** In the workspace profile only, `import-resolver.mjs` resolves `@stynx-nyx/<name>[/<subpath>]` to the package's source entry, so the edge is classified. The published profiles pass no package map and resolve exactly as before.
4. **Separate switch.** `createConfig` takes boundary strictness separately from type safety through two internal `boundaries` options, `strict` and `workspacePackages`. Only the workspace profile passes them. The documented `strict` option, the published profiles and their defaults are unchanged. The workspace's type-safety levels stay as they were until SM-11 deletes the switch.
5. **Acceptance.** `boundaries/dependencies` is `['error', { default: 'disallow' }]` for the workspace lib, nest and angular entry points. An undeclared package-name edge (`core` → `@stynx-nyx/data`) exits at error, declared edges are clean, and `pnpm lint` exits 0. `tools/eslint-config/test/rule-families.spec.mjs` carries these checks, plus one that every workspace-linted package is exactly one element.

### Task selectors

`test-tasks.json` adds a `database/` prefix to `db:rls` and `test:unit`, which runs `test/db`, and a `database/migrations/` prefix to `lint:families`, which runs `lint:repo`. Before this change, editing the bootstrap SQL matched no node's selectors. The RC task-policy digest changes, and the next signed RC re-runs every node.

## Consequences

- Consumers that bootstrap from STYNX's `database/` layout must apply `database/migrations` between ddl and seed. A consumer that overrode `PgSessionDbContextApplier`'s setting names and dropped every `app.*` name loses tenant context in the bootstrap policies until it adds them back.
- `Transaction`, the published profiles' rules and `strict` semantics, and every applied migration are unchanged.
- SM-11 deletes the `strict` switch. Its type-safety work no longer touches the boundary configuration.
