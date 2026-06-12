## Stynx – Architecture Guide

### Top-Level Layout

pnpm monorepo; source lives under two glob families:

- `packages/*/src/**` — shared backend libraries / platform packages
- `packages-web/*/src/**` — shared Angular libraries
- `reference/{api,web}/src/**` — deployable reference applications

494 TypeScript + 99 JavaScript files across 484 dependency-graph nodes with 1,989 edges (~4.1 average fan-out per node).

**Stack:** NestJS (backend API) · Angular (frontend, per stack config) · PostgreSQL

> The Angular routes introspector now identifies 15 reference-web routes. Route ids in the use-case files and [Reference App RBAC Inventory](arch/reference-app-rbac.md) are tied to that inventory.

---

### Module Boundaries

Four controller surfaces confirmed from the 50-endpoint API sample:

| Controller                   | Prefix          | Responsibility                                                                |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `DocumentsController`        | `/documents`    | Document lifecycle — create, delete, restore, complete, download, hard-delete |
| `RecordNotesController`      | `/record-notes` | CRUD + soft/hard delete + restore on notes                                    |
| `ReferenceProbesController`  | `/_probes`      | Observability probes: data-tx, idempotency, rate-limit, readonly-write        |
| `ReferenceDevAuthController` | `/_reference`   | Dev-only auth helpers: login, verify, demo tenants                            |

Per-package fan-in / fan-out breakdowns are (inferred) unavailable; the dep graph (484 nodes, 1,989 edges) is the only signal.

---

### Data Model

5 reference-app domain tables. The reference migration declares DB foreign keys and soft-delete FK registry entries for record notes, work items, work item entries, and work item locks.

```
record           → anchor entity; tenant_id, owner_user_id, status, email (PII)
record_note      → scoped to record via record_id; kind/label/detail/region/code/locale
work_item        → scoped to record via record_id; category, status, opened_on, target_on
work_item_entry  → line items under work_item (quantity, unit_units, total_units)
work_item_lock   → immutable locks on work_item (amount_units, locked_at, external_ref)
```

All five tables carry `tenant_id` (row-level multi-tenant isolation) and `created_at/by` + `updated_at/by` audit columns.

**PII:** `record.email` is registered in `core.pii_map` with legal basis `contract`, retention `until_account_closure`, and `hash_with_salt` erasure strategy.

---

### Cross-Cutting Concerns

**Auth / RBAC**

- Dev-login surface: `POST /_reference/dev-login`, `GET /_reference/auth-verify`, `GET /_reference/demo-tenants` (all `ReferenceDevAuthController`) is mounted only outside production by `SampleModule`.
- RBAC stats: reference roles, permissions, endpoint bindings, route bindings, and entity bindings are authored in [Reference App RBAC Inventory](arch/reference-app-rbac.md). Current `sense-rbac` still cannot read STYNX `@Permission(...)` decorators or Angular `stynxPermissionGuard(...)` route bindings directly.

**Multi-tenancy**

- `tenant_id` is present on every table. Tenant isolation is a uniform row-level concern.

**Soft-delete pattern**

- Both `DocumentsController` and `RecordNotesController` expose paired `DELETE /:id/hard` + `POST /:id/restore` endpoints, confirming a soft-delete + recycle pattern.

**Observability**

- `ReferenceProbesController` provides four named probes under `/_probes`: `data-tx`, `idempotency`, `ratelimit`, `readonly-write` — consistent with a liveness/readiness or internal health harness. (inferred)

**Persistence**

- PostgreSQL; reference migrations run through `runReferenceApiMigrations` in `reference/api/src/app.module.ts` and are linted by `pnpm lint:migrations`. Logical FK relationships (`record_note.record_id → record`, `work_item.record_id → record`, `work_item_entry.work_item_id → work_item`, `work_item_lock.work_item_id → work_item`) are DB-enforced and registered for STYNX soft-delete behavior.

**Frontend ↔ Backend**

- Declared stack is Angular; 15 frontend routes are captured. Reference API endpoints and primary Angular routes are linked from `docs/framework/product/use-cases/stynx-reference-app*.json`.

---

### Notable Cross-Package Imports

484 nodes and 1,989 edges yield a moderately dense graph. No per-package import lists were provided, so high-fan-in "hub" packages cannot be named. (inferred)

---

### Unmapped Endpoints

Use-case coverage now claims the 50 reference endpoints. The authored route-binding inventory lives in [Reference App RBAC Inventory](arch/reference-app-rbac.md). Current sensor route-binding output remains empty until DEVAI can read STYNX Angular permission guards.

- `RecordNotesController` — 7 endpoints: list, create, get, patch, delete, hard-delete, restore
- `DocumentsController` — 6 endpoints: create, delete, hard-delete, restore, complete, download
- `ReferenceProbesController` — 4 probe endpoints (internal / non-user-facing)
- `ReferenceDevAuthController` — 3 dev-only endpoints

**Mapping priority:** `DocumentsController` and `RecordNotesController` are user-facing and adjacent to PII-bearing data.

---

### Gaps

- DEVAI `sense-rbac` still emits empty route bindings for STYNX Angular permission guards.
- Operations, infra, and package test-depth gaps remain in [Known Gaps](/docs/meta/known-gaps).
