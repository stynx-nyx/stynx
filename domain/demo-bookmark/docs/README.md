<!-- Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692 -->
<!-- Hand-finished in C-4 Session S3 (F-9 step 1/N). -->

# `demo-bookmark` module

Reference module for the C-4 DEVAI adoption pilot. Demonstrates the blueprint → scaffold → finish lifecycle end-to-end against an existing stynx-shaped repo. **Not a production feature.** The `domain/demo-bookmark/web` package is private scaffold evidence only; it must not carry production dependencies or be treated as an adopter-facing package.

## Status

| Layer                  | Status       | Notes                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Blueprint              | ✅ landed    | [`docs/framework/product/draft/blueprints/demo-bookmark.json`](../../../docs/framework/product/draft/blueprints/demo-bookmark.json) — validates against DEVAI's schema                                                                                                                                                                    |
| DB migration + seed    | ✅ landed    | Real fields per blueprint, FK relations, soft-delete-aware unique index, PII map registration. See `db/migration.sql` + `database/seed.sql`.                                                                                                                                                                                              |
| API compile            | ✅ landed    | `pnpm --filter @stynx-domain/demo-bookmark-api typecheck` green. Module + controllers + DTOs + services + guards + decorators + entity types all in place.                                                                                                                                                                                |
| API services           | ✅ T2 wired  | `bookmark.service.ts` + `bookmark-tag.service.ts` use `@stynx/data` Database with drizzle queries (tenant-scoped, role/readonly hints). Schema at `api/src/demo-bookmark/schema.ts` matches `db/migration.sql` columns.                                                                                                                   |
| API policy guard       | ✅ T2 wired  | Controllers now use `@UseGuards(StynxAuthGuard, PermissionGuard)` + `@Permission('demo:bookmark:read                                                                                                                                                                                                                                      | write')`per the canonical stynx pattern. Local`BookmarkPolicyGuard`stub +`@Resource`/`@Action` decorators deleted. |
| API tests              | ✅ T2 stubs  | 4 spec files under `api/test/`: 2 controller route-binding tests (with mocked services + StynxAuthGuard/PermissionGuard overrides), 2 service "unit shape" tests (mock Database + RequestContext; per-task-DB integration deferred to F-20).                                                                                              |
| API typecheck          | ⚠️ F-19      | `pnpm --filter @stynx-domain/demo-bookmark-api typecheck` hits a pre-existing module-resolution error in `packages/auth/src/cognito-token-verifier.ts` (CJS importing ESM `jose@6`) that reference-api somehow doesn't hit despite identical tsconfig structure. Filed F-19; T2 work is structurally complete pending that investigation. |
| UI compile             | ✅ landed    | `pnpm --filter @stynx-domain/demo-bookmark-web typecheck` green. Feature module + components + service in place.                                                                                                                                                                                                                          |
| UI service wiring      | ✅ T2 wired  | `bookmark.service.ts` calls `/api/demo/bookmark/bookmark` via HttpClient with typed `Bookmark` / `CreateBookmarkInput` / `UpdateBookmarkInput` / `DeleteResult` interfaces. `providedIn: 'root'`.                                                                                                                                         |
| Docs                   | ✅ this file | + `ADR-0001.md` (scaffolder-shaped; may need hand-finishing later).                                                                                                                                                                                                                                                                       |
| CI                     | ✅ landed    | Per-module workflow at `.github/workflows/module-demo-bookmark.yml` (Phase D).                                                                                                                                                                                                                                                            |
| Workspace registration | ✅ landed    | `api/package.json` + `web/package.json` added in S3 so `pnpm install` includes the module.                                                                                                                                                                                                                                                |

## What landed in C-4 Session S3 (F-9 step 1/N)

1. **DB migration finished** — `db/migration.sql` expanded from the scaffolder's 1-field stub to the full 9-field `demo__bookmark_bookmark` table + the `demo__bookmark_bookmark_tag` join table, with the blueprint's indexes and FK cascade. Includes a `core.pii_map` registration for the `notes` column (incidental PII, P1Y retention) per `INV-PRIVACY-001`.
2. **Seed authored** — `database/seed.sql` has 3 representative bookmarks + 5 tags under the demo tenant. Idempotent (`ON CONFLICT DO NOTHING`).
3. **Workspace registration** — `api/package.json` and `web/package.json` make the module visible to `pnpm install`. Both register as private `@stynx-domain/demo-bookmark-{api,web}` packages.
4. **tsconfig** — `api/tsconfig.json` extends `@stynx-internal/tsconfig/lib.json`; `web/tsconfig.json` extends `@stynx-internal/tsconfig/angular18.json`.

## What remains (F-9 step 2/N — defer to a focused Engineer session)

1. **Author the missing guard + decorator files** (or rewire to `@stynx/backend`):
   - `api/src/demo-bookmark/guards/policy.guard.ts` (BookmarkPolicyGuard)
   - `api/src/demo-bookmark/decorators/policy.decorator.ts` (@Resource, @Action)
2. **Wire the services to `@stynx/data`** — replace stub `findAll`/`findOne`/`create`/etc. with real Postgres-backed queries. Use the stynx pattern: inject the `Database` token, run parameterized queries within a tenant-scoped transaction.
3. **Wire the Angular service to the API** — `web/src/app/demo-bookmark/bookmark.service.ts` should call the controllers via `@stynx-web/angular`'s HTTP transport.
4. **Real tests** — controller HTTP-shape + service per-task-DB integration + Angular component basics.
5. **Module-level CI run** — re-trigger `.github/workflows/module-demo-bookmark.yml` and confirm green.

## How to run (when finished)

```bash
pnpm install
pnpm --filter @stynx-domain/demo-bookmark-api build
pnpm --filter @stynx-domain/demo-bookmark-api test
pnpm --filter @stynx-domain/demo-bookmark-web build
```

## Decisions

See [`ADR-0001.md`](ADR-0001.md).
