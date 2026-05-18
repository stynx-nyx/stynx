# Wave 04 Reference Data and RBAC Report

**Date:** 2026-05-17
**Roles:** Architect / Engineer / Inspector
**Prompt:** `docs/work/plan/KNOWN-GAPS-WAVE-04-reference-data-rbac.md`

## Result

Wave 04 is complete for stynx-owned source, docs, and tests.

Several listed gaps were stale against the live repository:

- Reference-app FKs already existed in `reference/api/migrations/0001_reference.sql`.
- Work-item API controllers already existed for `work_item`, `work_item_entry`,
  and `work_item_lock` behavior.
- Reference permissions and role-permission seeds were already present.
- The PII map already contained legal basis and retention for `record.email`.
- The reference app migration runner was already wired in the API module.

The remaining useful work was to make the posture inspectable, enforced, and
kept current by tests.

## Implemented

- Added a production/prod environment gate around reference dev auth module
  assembly so `/_reference/dev-login` is not mounted in production.
- Added `docs/architecture/reference-app-rbac.json` as the authored RBAC
  inventory for reference roles, permissions, endpoint bindings, route bindings,
  and entity bindings.
- Added `docs/architecture/reference-app-data-rbac.md` to document reference
  app table ownership, FK posture, migration path, RBAC manifest, PII handling,
  and dev-auth policy.
- Refreshed reference use-case route IDs from the current Angular route sensor
  output and added the Flow route use case link.
- Added integration tests proving:
  - reference dev auth is omitted under production/prod configuration;
  - authored endpoint bindings stay aligned with `@Permission(...)`
    decorators;
  - authored route bindings stay aligned with `stynxPermissionGuard(...)`;
  - FK, PII, migration runner, and DB verification hooks remain present.
- Repaired Cognito session exchange so audited auth-table writes use the local
  STYNX user UUID as `app.actor_id`, not the opaque Cognito subject. This keeps
  curated-table DML audit triggers compatible with normal Cognito subjects.
- Updated durable state in `docs/KNOWN_GAPS.md`, `docs/Overview.md`,
  `docs/Architecture Guide.md`, `docs/RBAC Matrix.md`, and
  `docs/security/threat-model.md`.

## Evidence

- Full reference API tests:
  - `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/reference-api test`
  - Result: passed, 4 suites / 23 tests.
- Auth exchange unit test:
  - `pnpm --filter @stynx/auth test -- --runTestsByPath test/unit/auth.service.spec.ts`
  - Result: passed, 1 suite / 8 tests.
- Reference runtime integration:
  - `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/reference-api test:int`
  - Result: passed, 1 suite / 15 tests.
- Coverage sensor refresh:
  - `devai sense-coverage --repo-root . --routes-path .devai/state/sensors/inventory_routes/routes-angular.json --human`
  - Result: passed.
  - Current stats: 15 routes, 50 endpoints, 14 use cases, 67 links, no unmapped
    routes or endpoints.
- Fresh database verification:
  - Database: `stynx_wave04_verify`.
  - Platform and reference migrations applied with the platform owner role.
  - `DATABASE_URL=postgresql://${USER}@localhost:5432/stynx_wave04_verify pnpm db:verify`
  - Result: passed.

## Deferred Upstream Sensor Work

`devai sense-rbac` still emits `routeBindingCount: 0` and does not extract
stynx-specific `@Permission(...)` decorators or Angular
`stynxPermissionGuard(...)` calls. Stynx now has an authored RBAC inventory and
tests that keep it aligned with source, so the stynx package/runtime gap is
closed. Native DEVAI extraction support remains a Wave 10 upstream improvement.
