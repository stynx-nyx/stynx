# Wave 04 — Reference App Data and RBAC Baseline

**Roles:** Architect sets contract; Engineer implements; Inspector verifies.
**Branch suggestion:** `known-gaps/04-reference-data-rbac`.
**Primary gaps:** D-01, D-02, D-03, R-01, R-02, R-03, R-04, R-05.

## Purpose

Make reference-app persistence, RBAC, route bindings, PII handling, and
production auth posture visible to sensors and tests.

## Inputs

- `docs/KNOWN_GAPS.md` sections 1 and 2
- `reference/api/**`
- `reference/web/**`
- `packages/data/migrations/platform/**`
- `docs/product/use-cases/**`
- `docs/architecture/invariants/**`
- `docs/architecture/trace.json`

## Tasks

1. Decide whether reference-app tables are canonical platform examples or demo
   app tables. Document ownership.
2. Add or justify missing FKs:
   - `record_note.record_id -> record`
   - `work_item.record_id -> record`
   - `work_item_entry.work_item_id -> work_item`
   - `work_item_lock.work_item_id -> work_item`
3. Expose or explicitly retire `work_item`, `work_item_entry`, and
   `work_item_lock` APIs.
4. Ensure reference migrations use the same visible tooling and verification
   path as platform migrations.
5. Seed role/permission/action catalog rows for reference app surfaces.
6. Link endpoints and Angular routes to use cases or mark demo-only routes.
7. Author route bindings so frontend RBAC is inspectable.
8. Add PII legal basis and retention policy for `record.email`.
9. Prove `/_reference/dev-login` is environment-gated away from production.

## Acceptance

- Reference DB verify covers schema, FK, RLS, audit, and migration state.
- RBAC sensors see named roles, permissions, endpoint mappings, and route
  bindings.
- PII map contains legal basis and retention for contact email.
- Dev-login cannot run under production configuration.

## Verification

```sh
pnpm --filter @stynx/reference-api test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/reference-api test:int
pnpm --filter @stynx/reference-web build:web
DATABASE_URL=postgresql://${USER}@localhost:5432/<fresh-db> pnpm db:verify
pnpm run doctor
git diff --check
```
