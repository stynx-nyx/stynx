# STYNX agent guide

STYNX adopts the published `@aarusso-nyx/devai` package at tier 1 (`.devai/config/project.json`; the pinned constitution is `.devai/pin/constitution.md`; `law/constitution.md` is the binding entrypoint that links to it). Verify the installed version from `package.json`, not from prose.

Constitution Article 6 assigns write authority by path; the harness enforces it. Governed work is done under one of Owner, Architect, Inspector, Engineer, Auditor: use the role your task packet names, or state it once at the start when there is no packet. A role does not widen the requested scope. Work within that scope, preserve unrelated changes, verify in proportion to risk, never weaken or delete a test to make a change pass, use Conventional Commit subjects. Deliver what was asked; check in only when different readings of the request would lead to materially different work, when authority is missing, or before an irreversible effect.

## Before you edit: routing table

| If you change…                                           | Read first                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| authority, receipts, forbidden actions                   | the relevant article in `.devai/pin/constitution.md` and `law/policy/forbidden-action-authorizations.json`                                          |
| any behavior or test change                              | `docs/meta/development-contract.md` Engineering rules (rule 6: preserve tests, assertions, coverage thresholds, mutation targets and quality gates) |
| tenancy, RLS, database, generated tooling, release state | the matching section of `docs/meta/development-contract.md` (authoritative for STYNX-specific boundaries)                                           |
| a published package's public API                         | the baseline procedure below                                                                                                                        |
| a workflow file                                          | the receipt and docs-page requirements below                                                                                                        |
| `package.json` or the reference package manifests        | the byte-freeze rule below                                                                                                                          |
| an ADR or schema                                         | `law/adr/README.md` index, then only the record you touch; `law/schemas` for the schema you touch                                                   |

A failed check that names an article or contract section is also a read trigger.

## What DEVAI enforces and what STYNX enforces itself

DEVAI enforces authority: forbidden actions and their Owner receipts
(`law/policy/forbidden-action-authorizations.json`, checked by the pre-push
hook and the release lane), the post-merge receipt, and the constitution pin.
Product verification is repository-local and runs in `ci:stynx`
(`scripts/*.mjs`, `test/scripts/*.test.mjs`). Changes that look mechanical
still cross role boundaries; the recurring ones are:

- Editing `package.json`, `reference/api/package.json` or
  `reference/web/package.json` breaks their byte freeze in
  `test/scripts/local-rc-blocker-contract.test.mjs`; an Inspector commit
  rebinds the three SHA-256 sites per file.
- Editing any executable test moves its assertion projection;
  `pnpm check:trace` (gated in `ci:stynx`) fails until an Architect rebinds
  `law/trace.json`. `pnpm check:trace --print` lists what to bind.
- Changing a published package's emitted declarations moves
  `docs/framework/contracts/public-api-baselines.json`; an Architect rebinds
  it with `pnpm api:baselines:write` after confirming the change is intended.
- Editing a workflow file needs an Owner `FORBID-CI-WITHOUT-ADR` receipt for
  the exact commit SHA; `law/` commits are authored as `DEVAI Architect`.
- Adding, renaming or removing a workflow also needs its reference page in
  `docs/meta/ops/workflows/`, paired one to one by stem.
- `.devai/config` is rematerialized only by the pinned DEVAI CLI
  (`devai init bind`) from `law/policy/devai-adoption.json`; never hand-edit
  it. ADR-DEVAI-ADOPTION-0010 records the bind order.
- Dependency bumps to publishable packages need a changeset for the fixed
  group and `pnpm package-readmes:write`.
