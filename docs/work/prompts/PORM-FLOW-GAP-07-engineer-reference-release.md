# PORM-FLOW-GAP-07 - Engineer: Wire Reference And Release Surfaces

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-06`
**Scope:** Reference integration, package metadata, release hooks. No CMS.

## Goal

Make the new Flow packages visible to STYNX consumers and release checks. This closes the reassessment gaps for reference integration, OpenAPI/package visibility, and release readiness.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- updated `docs/contracts/flow-api.md`
- `packages/flow/package.json`
- `packages-web/angular-flow/package.json`
- `reference/api/**`
- `reference/web/**`
- root `package.json`
- `pnpm-workspace.yaml`
- release scripts:
  - `scripts/verify-release-policy.mjs`
  - `scripts/verify-web-sourcemaps.mjs`
  - `scripts/generate-release-drafts.mjs`
- release/readiness docs if present:
  - `docs/stynx/release-readiness.md`
  - `.changeset/**`

## Write Scope

Allowed:

- `reference/api/**`
- `reference/web/**`
- package manifests and package READMEs for Flow packages
- release/check scripts if package discovery needs updating
- `.changeset/**` if the repo requires changesets for new publishable packages
- `docs/stynx/release-readiness.md` only for factual package readiness evidence

Do not edit:

- Flow runtime implementation unless reference wiring exposes a small compile bug
- Angular Flow implementation unless reference wiring exposes a small compile bug
- `.devai/state/**`
- CMS files

## Required Work

1. Wire `@stynx/flow` into the reference API in the minimal way needed to expose routes or generated API metadata.
2. Wire `@stynx-web/angular-flow` into the reference web app in a minimal host route if the reference app is the correct consumer surface.
3. Ensure package manifests, exports, files, and dependency declarations are release-ready.
4. Ensure release policy scripts account for the new backend and Angular packages.
5. Add a changeset if repository policy requires one for new packages.
6. Document factual release readiness status without claiming gaps closed unless gates prove it.

## Verification

Run:

```sh
pnpm --filter @stynx/flow build
pnpm --filter @stynx-web/angular-flow build
pnpm --filter @stynx/reference-api build
pnpm --filter @stynx/reference-api test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/reference-api test:int
pnpm --filter @stynx/reference-web build
pnpm --filter @stynx/reference-web build:web
pnpm release:policy
pnpm release:status
git diff --check
git status --short --branch
```

If a reference-app test requires Docker/Testcontainers and the runtime is unavailable, report the exact error and run all non-container checks.

## Acceptance Criteria

- Reference surfaces can consume Flow packages without source deep imports.
- Release policy/status sees the new packages correctly.
- No CMS files are changed.
