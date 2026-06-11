<!-- Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692 -->
<!-- Hand-finished in C-4 Session S3 (F-9 step 1/N). -->

# `demo-bookmark` module

Reference module for the C-4 DEVAI adoption pilot. Demonstrates the blueprint → scaffold → finish lifecycle end-to-end against an existing stynx-shaped repo. **Not a production feature.** The `domain/demo-bookmark/web` package is private scaffold evidence only; it must not carry production dependencies or be treated as an adopter-facing package.

## Status

| Layer                  | Status       | Notes                                                                                                                                                                                                                       |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blueprint              | ✅ landed    | [`docs/framework/product/draft/blueprints/demo-bookmark.json`](../../../docs/framework/product/draft/blueprints/demo-bookmark.json) validates against DEVAI's schema.                                                       |
| DB migration + seed    | ✅ landed    | Real fields per blueprint, FK relations, soft-delete-aware unique index, PII map registration. See `db/migration.sql` + `database/seed.sql`.                                                                                |
| API compile            | ✅ R17 W07   | `pnpm --filter @stynx-domain/demo-bookmark-api build` exits 0. Schema now matches `db/migration.sql`, including `deleted_at`.                                                                                               |
| API policy guard       | ✅ T2 wired  | Controllers use `@UseGuards(StynxAuthGuard, PermissionGuard)` + `@Permission('demo:bookmark:read'/'demo:bookmark:write')`; local policy/decorator stubs are not used.                                                       |
| API services           | ✅ R17 W07   | `bookmark.service.ts` + `bookmark-tag.service.ts` use `@stynx/data` Database with tenant-scoped transactions, active-row reads, tag parent-tenant checks, and `deleted_at` soft delete.                                     |
| API tests              | ✅ R17 W07   | 5 API spec files / 53 tests: controller route/guard shape, HTTP error matrix, service DB integration, tenant isolation, and soft-delete URL reuse.                                                                          |
| UI compile             | ✅ R17 W07   | `pnpm --filter @stynx-domain/demo-bookmark-web build` exits 0.                                                                                                                                                              |
| UI service wiring      | ✅ R17 W07   | `bookmark.service.ts` calls `/api/demo/bookmark/bookmark` through Angular `HttpClient`; tenant/auth/request headers are left to `@stynx-web/angular` providers/interceptors rather than hand-rolled in the feature service. |
| UI tests               | ✅ R17 W07   | 2 web spec files / 5 tests: HttpClient request shape plus list rendering and create-flow delegation against a fake service.                                                                                                 |
| CI                     | ⚠️ blocked   | `.github/workflows/module-demo-bookmark.yml` now runs API build/test/lint and web build/test. GitHub Actions run is blocked until this local patch is committed and pushed to a branch/PR ref.                              |
| Docs                   | ✅ this file | + `ADR-0001.md` (scaffolder-shaped; no contradictory decision recorded).                                                                                                                                                    |
| Workspace registration | ✅ landed    | `api/package.json` + `web/package.json` register private `@stynx-domain/demo-bookmark-{api,web}` packages.                                                                                                                  |

## What landed in C-4 Session S3 (F-9 step 1/N)

1. **DB migration finished** — `db/migration.sql` expanded from the scaffolder's 1-field stub to the full 9-field `demo__bookmark_bookmark` table + the `demo__bookmark_bookmark_tag` join table, with the blueprint's indexes and FK cascade. Includes a `core.pii_map` registration for the `notes` column (incidental PII, P1Y retention) per `INV-PRIVACY-001`.
2. **Seed authored** — `database/seed.sql` has 3 representative bookmarks + 5 tags under the demo tenant. Idempotent (`ON CONFLICT DO NOTHING`).
3. **Workspace registration** — `api/package.json` and `web/package.json` make the module visible to `pnpm install`. Both register as private `@stynx-domain/demo-bookmark-{api,web}` packages.
4. **tsconfig** — `api/tsconfig.json` extends `@stynx-internal/tsconfig/lib.json`; `web/tsconfig.json` extends `@stynx-internal/tsconfig/angular18.json`.

## What landed in R17 W07 (F-9 step 2/N)

1. **Guards + decorators reconciled** — kept the T2 canonical `@stynx/auth` controller guard path (`StynxAuthGuard`, `PermissionGuard`, `@Permission`) because `@stynx/backend` documents those guards as the mounted backend auth/authorization substrate rather than a route-local replacement.
2. **Services wired to `@stynx/data`** — replaced scaffold stubs with real tenant-scoped `Database` transactions, active-row reads, parent-scoped tag queries, `ON CONFLICT DO NOTHING` tag creation, and `deleted_at` soft delete for bookmarks.
3. **Angular service wired to the API** — typed `BookmarkService` uses Angular `HttpClient` against the controller path and leaves tenant/auth/request headers to the stynx Angular provider/interceptor layer.
4. **Real tests added/deepened** — API controller shape + HTTP error matrix + per-task-DB service integration pass; web service/component TestBed specs pass.
5. **Module workflow tightened** — `.github/workflows/module-demo-bookmark.yml` now includes web build/test in addition to API build/test/lint. Remote CI remains blocked until this patch exists on a pushed ref.

## What remains (F-9 step 2/N)

None for the README's five R17 W07 items. The only residual is operational: GitHub Actions cannot validate uncommitted local edits; run the module workflow from a pushed branch/PR ref.

## How to run (when finished)

```bash
pnpm install
pnpm --filter @stynx-domain/demo-bookmark-api build
pnpm --filter @stynx-domain/demo-bookmark-api test
pnpm --filter @stynx-domain/demo-bookmark-web build
pnpm --filter @stynx-domain/demo-bookmark-web test
```

## Decisions

See [`ADR-0001.md`](ADR-0001.md).
