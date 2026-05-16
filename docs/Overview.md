## Purpose

Stynx is a multi-tenant document and work-item management platform (inferred) built as a pnpm monorepo. It exposes a NestJS REST API backed by PostgreSQL, consumed by an Angular front-end. Core business objects are documents, records, record notes, and work items.

## Stack at a glance

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| API              | NestJS                                        |
| Frontend         | Angular                                       |
| Database         | PostgreSQL                                    |
| Package manager  | pnpm                                          |
| Primary language | TypeScript (494 files), JavaScript (99 files) |

Source roots: `packages/*/src`, `apps/*/src`.

## Surface

| Surface                 | Count                       |
| ----------------------- | --------------------------- |
| REST endpoints          | 50                          |
| Frontend routes         | 0 (not detected — see Gaps) |
| DB tables               | 5                           |
| DB columns              | 61                          |
| PII columns             | 1                           |
| Dep-graph nodes / edges | 484 / 1,989                 |

**Controllers and their prefixes:**

- `ReferenceProbesController` — operational probes under `/_probes/` (data-tx, idempotency, ratelimit, readonly-write)
- `ReferenceDevAuthController` — dev-only auth helpers under `/_reference/` (auth-verify, demo-tenants, dev-login)
- `DocumentsController` — document lifecycle (create, download, soft-delete, hard-delete, restore, complete) under `/documents`
- `RecordNotesController` — full CRUD + soft-delete/restore under `/record-notes`

**Tables:** `record`, `record_note`, `work_item`, `work_item_entry`, `work_item_lock`

## Notable gaps

- **Zero foreign keys across 5 tables** — referential integrity between `record_note.record_id → record`, `work_item.record_id → record`, and `work_item_entry.work_item_id → work_item` is either enforced at the application layer (inferred) or absent.
- **PII without governance** — `record.email` (contact class) has no `legal_basis` or `retention` policy recorded; a compliance gap before any data export or retention automation.
- **All 50 endpoints unmapped** — zero coverage links between endpoints and use cases; no test-traceability exists.
- **RBAC shell only** — 0 roles and 0 permissions despite 94 endpoint bindings in the graph; access-control logic is either undiscovered or not yet implemented.
- **`work_item`, `work_item_entry`, `work_item_lock` have no visible API** — three of five tables have no owning controller in the sampled endpoints; the feature may be incomplete (inferred).
- **Frontend routes undetected** — scanner reports framework "react" with 0 routes, conflicting with the declared Angular front-end; Angular lazy-loaded routing was not scanned or does not yet exist.

## Where to look next

- `DocumentsController` (`/documents`) — core lifecycle logic; start here for the primary business flow.
- `record.email` — sole PII column; audit retention and legal-basis before any data pipeline work.
- `/_reference/dev-login` (`ReferenceDevAuthController`) — dev auth bypass; confirm it is environment-gated before production traffic reaches this service.
- `/_probes/*` (`ReferenceProbesController`) — idempotency, rate-limit, and read/write health signals; review before infrastructure changes.
- `work_item*` tables — significant unmapped data surface; locate the owning module or confirm the feature is in-progress.
