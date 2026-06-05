# Roles

STYNX inherits DEVAI's five-role authority model (Owner, Architect, Engineer, Inspector, Auditor) per Constitution Article 6.

The F1 paths each role authors in STYNX are enumerated in [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md). For the canonical role definitions, see [DEVAI's Roles section](https://aarusso-nyx.github.io/devai/docs/roles/).

| Role          | STYNX-substrate paths (post-R15 / 0.2.0)                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**     | `docs/framework/product/`, joint `docs/framework/glossary/`                                                                                 |
| **Architect** | `docs/framework/{arch,contracts,api,schemas}/`, `docs/meta/{adr,ops,security}/`, joint `docs/framework/glossary/`, README.md, GOVERNANCE.md |
| **Engineer**  | `apps/`, `packages/`, `packages-web/`, `domain/`, `tools/`, `infra/`, `database/`, root build scripts                                       |
| **Inspector** | `**/*.spec.ts`, `**/*.test.ts`, `test/`, `e2e/`, fixtures                                                                                   |
| **Auditor**   | Read-only across all substrates; authors reports + pilot retros under `docs/adopters/pilots/`                                               |

W07 may expand each role into its own page if STYNX develops role-specific operational notes beyond what `AGENTS.md` already carries.
