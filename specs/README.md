# `/specs/` — fully migrated

> **C-4 Session S5-2 (2026-05).** The `/specs/` directory is now empty (other than this README). All historical specs and ADRs were migrated to DEVAI substrates over Sessions S5 and S5-2.

## Where everything went

| Original file                                              | New home                                                                                    | Migrated in                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `STYNX-ADR-001-soft-delete.md`                             | [`docs/adr/STYNX-ADR-001-soft-delete.md`](../docs/adr/STYNX-ADR-001-soft-delete.md)         | S5 (`cb734ac`)                                       |
| `STYNX-ADR-002-perms-caching.md`                           | [`docs/adr/STYNX-ADR-002-perms-caching.md`](../docs/adr/STYNX-ADR-002-perms-caching.md)     | S5 (`cb734ac`)                                       |
| `STYNX-SPEC-v0.6.md`                                       | [`docs/architecture/STYNX-SPEC-v0.6.md`](../docs/architecture/STYNX-SPEC-v0.6.md)           | S5 (`cb734ac`)                                       |
| `STYNX-CDK-SKELETON.md`                                    | [`docs/architecture/STYNX-CDK-SKELETON.md`](../docs/architecture/STYNX-CDK-SKELETON.md)     | S5 (`cb734ac`)                                       |
| `STYNX-API-DATA.md`                                        | [`docs/architecture/STYNX-API-DATA.md`](../docs/architecture/STYNX-API-DATA.md)             | S5 (`cb734ac`)                                       |
| `GAP-000-bootstrap.md` … `GAP-006-permission-drift-slo.md` | [`docs/legacy/completed-gap-tasks/`](../docs/legacy/completed-gap-tasks/)                   | S5-2                                                 |
| `STYNX-ADOPT-EXAMPLE.md`                                   | [`docs/dev/STYNX-ADOPT-EXAMPLE.md`](../docs/dev/STYNX-ADOPT-EXAMPLE.md)                     | S5-2                                                 |
| `STYNX-CODEX-PROMPTS.md`                                   | [`.codex/legacy/STYNX-CODEX-PROMPTS.md`](../.codex/legacy/STYNX-CODEX-PROMPTS.md)           | S5-2 (paired with .codex/system.md retirement in S5) |
| `STYNX-REFERENCE-MIGRATION.sql`                            | [`docs/architecture/reference-migration.sql`](../docs/architecture/reference-migration.sql) | S5-2                                                 |

This directory can be removed entirely once all incoming links to `/specs/` are confirmed dead. For now it stays as a forwarding pointer (this README).

## How to participate

If you're tempted to add a new spec here, **don't.** Use the canonical DEVAI substrate instead:

| Spec kind                      | Canonical home                   |
| ------------------------------ | -------------------------------- |
| Architecture decision (closed) | `docs/adr/`                      |
| Engineering specification      | `docs/architecture/`             |
| Active invariant               | `docs/architecture/invariants/`  |
| Owner-side product spec        | `docs/product/`                  |
| Use-case                       | `docs/product/use-cases/`        |
| Module blueprint               | `docs/product/draft/blueprints/` |
| Operations runbook             | `docs/operations/`               |
| Security posture               | `docs/security/`                 |
| Developer-facing guide         | `docs/dev/`                      |
