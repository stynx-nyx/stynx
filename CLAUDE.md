# CLAUDE.md — stynx session-governance pointer

> **Phase H of the C-4 DEVAI adoption pilot (2026-05).** Created so DEVAI's `doctor` agents-claude-sync check passes against stynx (it requires both `CLAUDE.md` and `AGENTS.md` at the repo root, each citing Constitution Article 6 + the five roles + the canonical reading-order tokens). Substantive guidance lives where DEVAI says it lives — this file is a pointer.

## For AI sessions operating on stynx

Read in order:

1. **[`../devai/CLAUDE.md`](../devai/CLAUDE.md)** — DEVAI's own session-governance file. The discipline (propose-before-producing, cite-the-constitution, validate-before-declaring-done, schema-instances-validate-against-schemas, DEVAI-applies-to-itself per Article 36) applies in stynx as fully as in devai itself. Adopter-specific framing is at the bottom of this file.
2. **[`../devai/CONSTITUTION.md`](../devai/CONSTITUTION.md)** — 40 axioms. **Article 6** (substrate authority-by-path: Owner / Architect / Engineer / Inspector / Auditor) and **Article 36** (self-application — extends to adopters) matter most.
3. **[`../devai/README.md`](../devai/README.md)** — one-page orientation of the framework.
4. **[`../devai/BUILD-PLAN.md`](../devai/BUILD-PLAN.md)** — read the Status block. DEVAI is at `4eb4547` (Phase 20.F closeout, D-64) at the time of this writing.
5. **[`../devai/DESIGN-DECISIONS.md`](../devai/DESIGN-DECISIONS.md)** — the "why is this like that" reference.
6. **[`../devai/docs/schemas/`](../devai/docs/schemas/)** — the canonical schemas every JSON instance in stynx (under `.devai/state/`, `docs/arch/invariants/`, `docs/product/draft/blueprints/`) MUST validate against.
7. **[`AGENTS.md`](AGENTS.md)** — stynx-specific operational notes (RLS reminder, naming, path aliases, idiosyncratic stynx skills under `tools/`).
8. **[`GOVERNANCE.md`](GOVERNANCE.md)** — pointer to stynx's DEVAI-shaped governance surfaces.
9. **[`docs/pilots/c-4/`](docs/pilots/c-4/)** — pilot retros documenting the C-4 adoption experience (`phase-a-retro.md`, `phase-h-audit.md`, `phase-i-retro.md`, `phase-s7-loop-activation.md`, `phase-s8-tuning-audit.md`, `phase-s10-audit.md`).

## Five-role authority (Constitution Article 6, applied to stynx)

| Role          | What you may author in stynx                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**     | `docs/product/`, joint `docs/glossary/`                                                                                                      |
| **Architect** | `docs/arch/`, `docs/contracts/`, `docs/adr/`, `docs/ops/`, `docs/security/`, joint `docs/glossary/`, `README.md`, `GOVERNANCE.md`, this file |
| **Engineer**  | `apps/`, `packages/`, `packages-web/`, `domain/`, `tools/`, `infra/`, `db/`, root build scripts                                              |
| **Inspector** | `**/*.spec.ts`, `**/*.test.ts`, `test/`, `tests/`, `e2e/`, fixtures                                                                          |
| **Auditor**   | Read-only across all substrates; authors only reports / scorecards / backlogs / pilot retros                                                 |

`F4` (`.devai/state/inventory/`, `.devai/state/sensors/`, `.devai/state/inv-candidates/`) is auto-generated; `F5` (`.devai/config/` core) is upgrade-controlled. Neither is hand-authored.

## Per-commit discipline

- **Propose before producing:** for any new file, package, configuration, or architectural decision in stynx, describe intent first, ask for approval, then execute as approved. Surface deviations rather than adjust silently.
- **Cite the constitution:** when an action is governed by an Article, name it explicitly ("Per Article 6, this Engineer commit edits `packages/`...").
- **Validate before declaring done:** every Phase / sub-batch has explicit validation criteria. Run them. Report results before claiming completion.
- **Schema instances validate against schemas:** anything matching a schema in `../devai/docs/schemas/` MUST validate against that schema. Schema drift is a hard-gate failure (the Phase E CI workflow `.github/workflows/devai-gates.yml` enforces this for invariants and module-blueprints).
- **Article 36 self-application transitively:** stynx exercises DEVAI's tools against itself from Phase A onward — sensors against the inventory, scaffolders against blueprints, doctor against the workspace. Non-negotiable.

## Adopter-specific framing (where stynx differs from DEVAI-self-development)

The DEVAI `CLAUDE.md` linked above is shaped for DEVAI's OWN development. Adopting it transitively means accepting that:

- Some `devai doctor` checks (workspace-layout, f1-paths-present, schemas-loadable, constitution-symlink) hardcode DEVAI's monorepo shape (`packages/{cli,core,schemas,sensors,utils}`, root-level `tsconfig.base.json`, `docs/schemas/`, `.devai/constitution.md`). These will fail on adopters today; the underlying gap is filed in [`docs/pilots/c-4/phase-a-retro.md`](docs/pilots/c-4/phase-a-retro.md) (D-A-9 from Phase H).
- The reading-order tokens enforced by `agents-claude-sync` (`README.md`, `CONSTITUTION.md`, `BUILD-PLAN.md`, `DESIGN-DECISIONS.md`, `docs/schemas`) refer to **DEVAI's** files (in the sibling `../devai/` checkout), not stynx's. This file references them by path so the check passes; an adopter without a sibling devai checkout would need DEVAI to be installed via package manager.
- Stynx **inherits** DEVAI's universal invariants (e.g. `INV-INVENTORY-001`, `INV-INVENTORY-002`, `INV-INVENTORY-003`) from `../devai/docs/arch/invariants/`. Stynx's own invariants live under [`docs/arch/invariants/`](docs/arch/invariants/) and SHOULD specialize the universal ones rather than redefine them.

## When in doubt

1. **[`../devai/docs/adopters/common-pitfalls.md`](../devai/docs/adopters/common-pitfalls.md)** — the most likely place to find your specific issue documented.
2. **[`../devai/DESIGN-DECISIONS.md`](../devai/DESIGN-DECISIONS.md)** — the "why is this like that" reference.
3. **[`../devai/CONSTITUTION.md`](../devai/CONSTITUTION.md)** — when the question touches authority, substrates, or escalation.
4. **Ask the user.** Do not invent.
