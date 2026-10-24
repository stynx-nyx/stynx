# STYNX development contract

This is the repository-local engineering contract for all contributors.

## Repository responsibilities

- `reference/{api,web}/` contains the NestJS and Angular reference applications.
- `packages/*` contains reusable backend modules in the `@stynx-nyx/*` family.
- `packages-web/*` contains reusable Angular modules in the same package family.
- `tools/*` contains internal repository tooling.
- `domain/*` contains product modules and their API, web, database, and docs surfaces.
- `infra/cdk/` contains AWS CDK infrastructure.
- `database/ddl/` contains canonical SQL definitions.
- `test/` contains the central test harness: the workspace test packages under
  `test/*` and their shared support and performance fixtures.

## Engineering rules

1. Mirror existing naming, module boundaries, public API patterns, and lint rules.
2. Enforce tenant isolation and row-level security for every new table and API
   surface. Treat `INV-RBAC-001` and the tenancy package as mandatory references.
3. Update database seeds and the tests under `test/db/` whenever DDL changes.
4. Prefer configured path aliases such as `@core`, `@shared`, `@admin`,
   `@storage`, and `@env` over deep relative imports.
5. Do not delete, bypass, or hand-edit generated scripts that CI or release
   automation depends on.
6. Preserve existing tests, assertions, coverage thresholds, the 38 mutation
   targets, and ordinary quality gates. Functional tests and ordinary quality
   gates remain readiness-bearing. Mutation testing remains available only as
   optional manual hardening through `pnpm test:mutation`; its absence, failure,
   or stale reports cannot promote or block acceptance or publication. A feature
   change must add or update tests for its behavior.
7. Use Conventional Commit subjects and do not bypass hooks during routine work.
8. Package clean commands may remove only package-local disposable, untracked
   outputs; workspace clean commands may remove only repository-local
   disposable, untracked outputs. They must preserve every tracked path and use
   only the declared Node runtime, explicitly supported host commands, or tools
   resolvable from the exact frozen dependency graph; undeclared package
   executables and downloaded-on-demand tools are invalid.
9. The `@stynx-nyx/privacy` ordinary test tier contains exactly its three unit
   specs and one wiring spec. Its serialized integration tier contains
   `privacy.module.spec.ts` and `privacy-object-store.provider.spec.ts`. These
   populations are disjoint and their union is all six executable test files.
   Coverage executes all six through its dedicated configuration without
   changing thresholds or timeouts. The preserved unrelated-concurrency restriction
   is prospectively amended only for ordinary `test` commands by
   [ADR0035](/docs/adr/ADR-0035),
   approved by the Owner on 2026-10-24: two root Turbo package slots and one
   Vitest/Node test-file worker per ordinary package command, including direct
   package invocation. Integration, E2E, coverage, mutation and standalone build
   scheduling retain their existing contracts; populations, assertions and all
   other rule 9 requirements remain unchanged. The prospective
   STYNX 1.6.0 privacy-tier amendment in ADR-0019 extends the historical D13
   population additively; every original behavioral case and assertion remains
   required. Local provider evidence does not qualify production cloud effects.

## Release and security references

When release state is uncertain, inspect the published package manifests and
`CHANGELOG.md` files under `packages/*` and `packages-web/*`, the `v<version>`
release tags, `docs/adopters/stynx/support-policy.md`,
`docs/adopters/stynx/release-readiness.md`, and recent Git history before
making a claim. The repository-specific dependency audit procedure is retained
at `tools/npm-security-upgrade-auditor/`.
