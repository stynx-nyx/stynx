# Reference App Data and RBAC Baseline

**Authority:** Architect (Constitution Article 6).
**Status:** Wave 04 baseline, 2026-05-17.

The reference application is a canonical worked example for STYNX adopters, not
part of the platform schema itself. Its `sample.*` tables live in
`reference/api/migrations/0001_reference.sql`; platform tables and helpers live
under `packages/data/migrations/platform/`.

## Data Ownership

`sample.record`, `sample.record_note`, `sample.work_item`,
`sample.work_item_entry`, and `sample.work_item_lock` are reference-app domain
tables. They demonstrate tenant-scoped soft delete, archive mirrors, RLS,
audit triggers, PII registration, and default role-permission seeding.

They are not framework tables. A consuming application may copy the pattern but
must own its own domain schema, PII map, and use-case coverage.

## Referential Integrity

The reference migration declares DB foreign keys and soft-delete behavior for
the domain aggregate:

| Child table                           | Parent                | DB FK | Soft-delete behavior |
| ------------------------------------- | --------------------- | ----- | -------------------- |
| `sample.record_note.record_id`        | `sample.record.id`    | yes   | cascade              |
| `sample.work_item.record_id`          | `sample.record.id`    | yes   | block                |
| `sample.work_item_entry.work_item_id` | `sample.work_item.id` | yes   | cascade              |
| `sample.work_item_lock.work_item_id`  | `sample.work_item.id` | yes   | block                |

`data.register_softdelete_fk(...)` records the intended soft-delete behavior in
`core.softdelete_fk_registry`, and the reference runtime integration suite
asserts cascade/block behavior.

## Migration Path

Reference migrations use the same visible toolchain as platform migrations:

- `reference/api/src/app.module.ts` runs `reference/api/migrations/*.sql`
  through the `@stynx-nyx/data` migration runner integration.
- `pnpm lint:migrations` includes `reference/api/migrations/0001_reference.sql`.
- `pnpm db:verify` verifies schemas, RLS, archive mirrors, and audit triggers
  on any database identified by `DATABASE_URL` or `STYNX_DATABASE_URL`.
- `reference/api/test/integration/reference-api.runtime.spec.ts` applies the
  reference migration against a real PostgreSQL database and exercises RLS,
  audit writes, soft-delete/archive behavior, FK cascade/block behavior,
  idempotency, rate-limit, and document storage paths.

## RBAC Inventory

The authored RBAC and route-binding inventory is `reference-app-rbac.json` in
this directory. It records the named roles, permission keys, endpoint bindings,
route bindings, and entity bindings that are currently implemented by:

- `reference/api/migrations/0001_reference.sql` permission and role seed rows;
- `@Permission(...)` decorators in `reference/api/src/sample/*controller.ts`;
- `stynxPermissionGuard(...)` calls in `reference/web/src/app/app.routes.ts`.

Current DEVAI `sense-rbac` still synthesizes endpoint bindings from guard names
and always emits an empty `routeBindings` array. Until that upstream sensor can
read STYNX permission decorators and Angular permission guards, this authored
inventory is the STYNX source of truth for reference-app RBAC bindings.

## Use-Case Links

Reference endpoints and Angular routes are claimed by:

- `docs/framework/product/use-cases/stynx-reference-app.json`;
- `docs/framework/product/use-cases/stynx-reference-app-extended.json`.

The primary user-facing routes are bound to stable route ids from the current
`sense-routes` Angular inventory. Auth-only routes (`login`, `tenant`,
dashboard, `unauthorized`, and the catch-all redirect) remain intentionally
unpermissioned; their access posture is documented by route guards or public
navigation behavior rather than RBAC permission bindings.

## PII

`sample.record.email` is registered in `core.pii_map` with:

- category: `direct_pii` in the reference migration, normalized by sensors as
  contact PII;
- strategy: `hash_with_salt`;
- legal basis: `contract`;
- retention: `until_account_closure`.

The same migration registers the other free-text and subject-link fields that
may contain personal data.

## Dev Auth

`ReferenceDevAuthController` is a reference-app convenience surface. It is
public by design but not production-capable: `SampleModule` includes the
controller and service only when neither `NODE_ENV` nor `STYNX_ENVIRONMENT`
normalizes to `production` or `prod`.

Production deployments use the Cognito-backed STYNX auth path instead of
`/_reference/dev-login`.
