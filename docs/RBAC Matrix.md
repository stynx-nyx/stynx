# RBAC Matrix — Stynx

**Generated:** 2026-05-16 | **Endpoints:** 50 | **Routes:** 0 | **Tables:** 5

**Role:** generated diagnostic/template artifact for the current
repository/reference-app inventory. It is not the canonical framework RBAC
implementation; see [ADR-003](adr/ADR-003-rbac-matrix-role.md).

**Wave 04 update:** the authored reference-app RBAC inventory is
[architecture/reference-app-rbac.json](architecture/reference-app-rbac.json).
It records 4 roles, 38 permission keys, 44 permissioned endpoint bindings, 9
Angular route bindings, and 12 entity bindings. This generated matrix remains
useful as a historical sensor diagnostic, but its empty role/permission counts
are superseded for the reference app by the authored inventory and tests.

---

## RBAC ILF Tables

The historical sensor body did not discover RBAC ILF tables. The reference
migration seeds the canonical platform tables `auth.roles`, `auth.perms`,
`auth.role_perms`, `auth.membership_roles`, and `auth.direct_perms`; see
[architecture/reference-app-rbac.json](architecture/reference-app-rbac.json).

---

## Roles

The authored reference-app roles are `owner`, `admin`, `member`, and `viewer`.

---

## Permissions

The authored reference-app permission catalog contains the sample CRUD
permissions plus Flow permissions seeded by
`reference/api/migrations/0001_reference.sql`.

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

| Table             | Sensitive Columns                                     |
| ----------------- | ----------------------------------------------------- |
| `record`          | **email** (PII — `contract`, `until_account_closure`) |
| `record_note`     | none flagged                                          |
| `work_item`       | none flagged                                          |
| `work_item_entry` | none flagged                                          |
| `work_item_lock`  | none flagged                                          |

The reference migration declares DB foreign keys and registers STYNX
soft-delete FK behavior. The old `foreign_key_count: 0` signal is stale for the
current source.

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
