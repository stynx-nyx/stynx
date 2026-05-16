# `/specs/` — partial-migration legacy

> **C-4 Session S5 (Phase G.2 of the DEVAI adoption pilot, 2026-05).** This directory used to be the canonical home for stynx specs and ADRs. Per session directive 5.2 (DEVAI is authoritative; supersedes legacy stynx governance), the canonical homes are now DEVAI substrates:

| Stynx-legacy spec class | Canonical DEVAI substrate                                           |
| ----------------------- | ------------------------------------------------------------------- |
| ADR                     | [`docs/adr/`](../docs/adr/)                                         |
| Architecture spec       | [`docs/architecture/`](../docs/architecture/)                       |
| Invariant               | [`docs/architecture/invariants/`](../docs/architecture/invariants/) |
| Owner-side product spec | [`docs/product/`](../docs/product/)                                 |
| Operations runbook      | [`docs/operations/`](../docs/operations/)                           |
| Security posture        | [`docs/security/`](../docs/security/)                               |

## What landed in S5

| File                             | Migrated to                                                                             | Notes                |
| -------------------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| `STYNX-ADR-001-soft-delete.md`   | [`docs/adr/STYNX-ADR-001-soft-delete.md`](../docs/adr/STYNX-ADR-001-soft-delete.md)     | Verbatim relocation. |
| `STYNX-ADR-002-perms-caching.md` | [`docs/adr/STYNX-ADR-002-perms-caching.md`](../docs/adr/STYNX-ADR-002-perms-caching.md) | Verbatim relocation. |
| `STYNX-SPEC-v0.6.md`             | [`docs/architecture/STYNX-SPEC-v0.6.md`](../docs/architecture/STYNX-SPEC-v0.6.md)       | Verbatim relocation. |
| `STYNX-CDK-SKELETON.md`          | [`docs/architecture/STYNX-CDK-SKELETON.md`](../docs/architecture/STYNX-CDK-SKELETON.md) | Verbatim relocation. |
| `STYNX-API-DATA.md`              | [`docs/architecture/STYNX-API-DATA.md`](../docs/architecture/STYNX-API-DATA.md)         | Verbatim relocation. |

## What remains under `/specs/` (NOT yet migrated)

The following are deferred — they need per-file judgment calls (Owner authority for GAP-\* tasks; reference material for the others) that should be made in a follow-up session by someone with stynx domain context.

- `GAP-000-bootstrap.md` through `GAP-006-permission-drift-slo.md` — these are gap-task specs that should likely become either DEVAI invariants or backlog items, depending on whether each gap is currently an open invariant violation. Owner-judgment decision.
- `STYNX-ADOPT-EXAMPLE.md` — example for adopters of stynx framework. Could move to `docs/dev/` or stay here.
- `STYNX-CODEX-PROMPTS.md` — prompts catalog for `.codex/`. Tied to the `.codex/` retirement timeline (F-5 of S5).
- `STYNX-REFERENCE-MIGRATION.sql` — reference SQL migration. Could move to `docs/architecture/` as illustrative or to `reference/api/migrations/` if it's actually used.

## How to participate

If you migrate a remaining file, update this README's table to reflect the move. If you decide a file should stay in `/specs/` indefinitely (legitimate exception), document the rationale here.
