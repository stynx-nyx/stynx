# STYNX agent guide

STYNX adopts the published `@aarusso-nyx/devai` 1.4.5 package at tier 1
(`.devai/config/project.json`, constitution 1.0.0 pinned). Read the
repository authority sources in this order before making changes:

1. `README.md`
2. `law/constitution.md` and its pinned source at `.devai/pin/constitution.md`
3. `law/adr`
4. `law/schemas`
5. `docs/meta/development-contract.md`

Constitution Article 6 assigns authority by path. Declare exactly one current
human role for governed work: Owner, Architect, Inspector, Engineer, or
Auditor. A role declaration does not broaden the user's requested scope.

Work only within that scope, preserve unrelated user changes, and verify
changes in proportion to their risk. Never weaken or delete tests to make a
change pass. Use Conventional Commit subjects.

For STYNX-specific boundaries, tenancy and RLS requirements, database change
obligations, generated tooling, and release-state references, the development
contract remains authoritative.

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
- Dependency bumps to publishable packages need a changeset for the fixed
  group and `pnpm package-readmes:write`.
