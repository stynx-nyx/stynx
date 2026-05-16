# RBAC Matrix — Stynx

**Generated:** 2026-05-16 | **Endpoints:** 50 | **Routes:** 0 | **Tables:** 5

---

## RBAC ILF Tables

No ILF tables were discovered. `rbac.ilf_tables` is empty — no database-level role or permission tables are registered with the RBAC inventory sensor. Automated binding verification is blocked without them.

---

## Roles

**0 roles discovered.** No named principals exist in the RBAC inventory.

---

## Permissions

**0 permissions discovered.** No named actions exist in the RBAC inventory.

---

## Endpoint Bindings

The introspection reports **94 endpoint bindings** (`endpointBindingCount: 94`) against **0 roles** and **0 permissions**. These 94 records are structurally orphaned: bindings cannot resolve without named roles or permissions. This is a sensor data anomaly, not evidence of a functioning access-control layer.

**Coverage:** All 50 discovered endpoints are unmapped (`unmapped_endpoint_count: 50`).

| Controller                 | Method | Path                        | Role | Permission |
| -------------------------- | ------ | --------------------------- | ---- | ---------- |
| ReferenceProbesController  | GET    | `/_probes/data-tx`          | —    | —          |
| ReferenceProbesController  | POST   | `/_probes/idempotency`      | —    | —          |
| ReferenceProbesController  | GET    | `/_probes/ratelimit`        | —    | —          |
| ReferenceProbesController  | GET    | `/_probes/readonly-write`   | —    | —          |
| ReferenceDevAuthController | GET    | `/_reference/auth-verify`   | —    | —          |
| ReferenceDevAuthController | GET    | `/_reference/demo-tenants`  | —    | —          |
| ReferenceDevAuthController | POST   | `/_reference/dev-login`     | —    | —          |
| DocumentsController        | POST   | `/documents`                | —    | —          |
| DocumentsController        | DELETE | `/documents/:id`            | —    | —          |
| DocumentsController        | POST   | `/documents/:id/complete`   | —    | —          |
| DocumentsController        | GET    | `/documents/:id/download`   | —    | —          |
| DocumentsController        | DELETE | `/documents/:id/hard`       | —    | —          |
| DocumentsController        | POST   | `/documents/:id/restore`    | —    | —          |
| RecordNotesController      | GET    | `/record-notes`             | —    | —          |
| RecordNotesController      | POST   | `/record-notes`             | —    | —          |
| RecordNotesController      | DELETE | `/record-notes/:id`         | —    | —          |
| RecordNotesController      | GET    | `/record-notes/:id`         | —    | —          |
| RecordNotesController      | PATCH  | `/record-notes/:id`         | —    | —          |
| RecordNotesController      | DELETE | `/record-notes/:id/hard`    | —    | —          |
| RecordNotesController      | POST   | `/record-notes/:id/restore` | —    | —          |

_20 of 50 sampled endpoints shown. Remaining 30 are not present in the input sample and are (inferred) unmapped._

---

## Data Model

| Table             | Sensitive Columns                                                   |
| ----------------- | ------------------------------------------------------------------- |
| `record`          | **email** (PII — contact class; missing `legal_basis`, `retention`) |
| `record_note`     | none flagged                                                        |
| `work_item`       | none flagged                                                        |
| `work_item_entry` | none flagged                                                        |
| `work_item_lock`  | none flagged                                                        |

No foreign keys declared (`foreign_key_count: 0`) — tenant and ownership referential integrity is unverified at the DB layer.

---

## Gaps (INV-INVENTORY-003)

| #    | Gap                          | Detail                                                                     |
| ---- | ---------------------------- | -------------------------------------------------------------------------- |
| G-01 | No RBAC ILF tables           | `rbac.ilf_tables` empty — DB-level role/permission tables absent           |
| G-02 | No roles defined             | `roleCount: 0` — no named principals to bind                               |
| G-03 | No permissions defined       | `permissionCount: 0` — no named actions to enforce                         |
| G-04 | All 50 endpoints unmapped    | Every endpoint lacks a coverage link                                       |
| G-05 | 94 orphaned binding records  | Raw binding count cannot resolve without roles/permissions                 |
| G-06 | No route bindings            | `routeBindingCount: 0`, `route_count: 0` — frontend RBAC unverifiable      |
| G-07 | PII field without governance | `record.email` missing `legal_basis` and `retention`                       |
| G-08 | No DB foreign keys           | `foreign_key_count: 0` — tenant/ownership integrity unverified at DB level |
