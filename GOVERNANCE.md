# GOVERNANCE.md

> **Phase G of the C-4 DEVAI adoption pilot (2026-05).** This file is now a pointer; substantive governance lives where DEVAI says it lives.

Stynx is governed by **DEVAI** ([sibling repo](../devai)). Per session directive 5.2 (DEVAI is authoritative over stynx; DEVAI's governance supersedes legacy stynx governance), the canonical governance surfaces are:

| Concern                                                         | Canonical location                                                                   | Notes                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Constitutional discipline (5 roles, substrates, evidence chain) | [`../devai/CONSTITUTION.md`](../devai/CONSTITUTION.md)                               | Article 6 path-authority is the source of truth for who-may-edit-what.                                        |
| Engineering specifications                                      | [`docs/architecture/`](docs/architecture/)                                           | Created by `devai init --execute` in Phase A.2.                                                               |
| Architectural decisions                                         | [`docs/adr/`](docs/adr/)                                                             | DEVAI-shaped ADR substrate; see also [`specs/`](specs/) for legacy stynx ADRs pending migration to docs/adr/. |
| Active invariants                                               | [`docs/architecture/invariants/`](docs/architecture/invariants/)                     | Currently: `INV-RBAC-001`, `INV-PRIVACY-001` (Phase B).                                                       |
| Contracts                                                       | [`docs/contracts/`](docs/contracts/)                                                 | DEVAI substrate; populate as schemas/contracts are extracted.                                                 |
| Operations runbooks                                             | [`docs/operations/`](docs/operations/)                                               | Both DEVAI substrate (README.md) and legacy stynx (`recovery/`, `runbooks/`).                                 |
| Security posture                                                | [`docs/security/`](docs/security/)                                                   | DEVAI substrate.                                                                                              |
| Glossary                                                        | [`docs/glossary/`](docs/glossary/)                                                   | DEVAI substrate.                                                                                              |
| Inventory & evidence                                            | [`.devai/state/`](.devai/state/)                                                     | Auto-generated (do not hand-edit). Sensors, candidates, telemetry, evidence chain.                            |
| Module blueprints                                               | [`docs/product/draft/blueprints/`](docs/product/draft/blueprints/)                   | Currently: `BP-DEMO-BOOKMARK-001` (Phase C).                                                                  |
| CI gates                                                        | [`.github/workflows/devai-gates.yml`](.github/workflows/devai-gates.yml)             | Runs DEVAI's seven L0 sensors + invariant + blueprint validation on every PR (Phase E).                       |
| Commit format                                                   | [`tools/repo-config/commitlint.config.cjs`](tools/repo-config/commitlint.config.cjs) | Accepts both DEVAI role-prefix subjects (`Architect: ...`) and Conventional Commits (Phase G).                |

## What this file used to point at

The pre-pilot `docs/governance/{health, audit, compliance}` tree is **deprecated** as the source of truth. Its content is being migrated into the DEVAI substrates above; references that have not yet migrated should be considered legacy and not authoritative.

## How to participate

- **Contributors**: see [CONTRIBUTING.md](CONTRIBUTING.md) for commit and PR conventions.
- **Adopters considering DEVAI**: see [`../devai/docs/adopters/`](../devai/docs/adopters/) — stynx is the C-4 reference adopter; the [Phase A retro](docs/devai-phase-a-retro.md) and [Phase I retro](docs/devai-phase-i-retro.md) (when published) document our experience.
- **Anyone touching governance**: cite the relevant Constitution article in your commit message body. Per the C-4 pilot, DEVAI's framing wins in any conflict with stynx-legacy framing.
