## Stynx – Architecture Guide

### Top-Level Layout

pnpm monorepo; source lives under two glob families:

- `packages/*/src/**` — shared libraries / platform packages
- `apps/*/src/**` — deployable applications

494 TypeScript + 99 JavaScript files across 484 dependency-graph nodes with 1,989 edges (~4.1 average fan-out per node).

**Stack:** NestJS (backend API) · Angular (frontend, per stack config) · PostgreSQL

> The routes introspector identified a React framework with 0 routes — this conflicts with the declared Angular frontend. Either a React sub-app exists in the monorepo or the introspector targeted the wrong app root. (inferred)

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

5 tables, 61 columns, **0 declared foreign keys** — referential integrity is application-enforced only.

```
record           → anchor entity; tenant_id, owner_user_id, status, email (PII)
record_note      → scoped to record via record_id; kind/label/detail/region/code/locale
work_item        → scoped to record via record_id; category, status, opened_on, target_on
work_item_entry  → line items under work_item (quantity, unit_units, total_units)
work_item_lock   → immutable locks on work_item (amount_units, locked_at, external_ref)
```

All five tables carry `tenant_id` (row-level multi-tenant isolation) and `created_at/by` + `updated_at/by` audit columns.

**PII:** `record.email` is classified `contact`. Fields `legal_basis` and `retention` are missing — treat as a compliance gap before production.

---

### Cross-Cutting Concerns

**Auth / RBAC**

- Dev-login surface: `POST /_reference/dev-login`, `GET /_reference/auth-verify`, `GET /_reference/demo-tenants` (all `ReferenceDevAuthController`). Production auth mechanism is not visible in inputs. (inferred)
- RBAC stats: **0 roles, 0 permissions** but **94 endpoint bindings** recorded — bindings exceed the sampled endpoint count (50). Role/permission definitions are absent; this is a gap.

**Multi-tenancy**

- `tenant_id` is present on every table. Tenant isolation is a uniform row-level concern.

**Soft-delete pattern**

- Both `DocumentsController` and `RecordNotesController` expose paired `DELETE /:id/hard` + `POST /:id/restore` endpoints, confirming a soft-delete + recycle pattern.

**Observability**

- `ReferenceProbesController` provides four named probes under `/_probes`: `data-tx`, `idempotency`, `ratelimit`, `readonly-write` — consistent with a liveness/readiness or internal health harness. (inferred)

**Persistence**

- PostgreSQL; no migration tool identified in inputs. Logical FK relationships (`record_note.record_id → record`, `work_item.record_id → record`, `work_item_entry.work_item_id → work_item`, `work_item_lock.work_item_id → work_item`) are all application-enforced.

**Frontend ↔ Backend**

- Declared stack is Angular; 0 frontend routes were captured. All 50 API endpoints are currently unmapped to any frontend use-case.

---

### Notable Cross-Package Imports

484 nodes and 1,989 edges yield a moderately dense graph. No per-package import lists were provided, so high-fan-in "hub" packages cannot be named. (inferred)

---

### Unmapped Endpoints

All 50 endpoints are unmapped (0 use-case links, 0 route bindings). Concentration by controller:

- `RecordNotesController` — 7 endpoints: list, create, get, patch, delete, hard-delete, restore
- `DocumentsController` — 6 endpoints: create, delete, hard-delete, restore, complete, download
- `ReferenceProbesController` — 4 probe endpoints (internal / non-user-facing)
- `ReferenceDevAuthController` — 3 dev-only endpoints

**Mapping priority:** `DocumentsController` and `RecordNotesController` are user-facing and adjacent to PII-bearing data.

---

### Gaps

- Frontend routes: 0 captured — frontend coverage is blind despite Angular/React stack.
- No DB-level FK constraints; referential integrity model is undocumented.
- RBAC role and permission definitions absent despite 94 endpoint bindings.
- `record.email` PII is missing `legal_basis` and `retention` policy fields.
- No database migration tooling identified.
- 0 use-case links across all 50 endpoints.
