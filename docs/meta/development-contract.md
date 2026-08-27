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
- The legacy `backend/`, `frontend/`, `bootstrap/`, and `test/` trees are outside
  the active package graph except where root tooling explicitly references them.

## Engineering rules

1. Mirror existing naming, module boundaries, public API patterns, and lint rules.
2. Enforce tenant isolation and row-level security for every new table and API
   surface. Treat `INV-RBAC-001` and the tenancy package as mandatory references.
3. Update database seeds and the tests under `test/db/` whenever DDL changes.
4. Prefer configured path aliases such as `@core`, `@shared`, `@admin`,
   `@storage`, and `@env` over deep relative imports.
5. Do not delete, bypass, or hand-edit generated scripts that CI or release
   automation depends on.
6. Preserve existing tests, assertions, coverage thresholds, mutation targets,
   and quality gates. A feature change must add or update tests for its behavior.
7. Use Conventional Commit subjects and do not bypass hooks during routine work.
8. Package clean commands may remove only package-local disposable, untracked
   outputs; workspace clean commands may remove only repository-local
   disposable, untracked outputs. They must preserve every tracked path and use
   only the declared Node runtime, explicitly supported host commands, or tools
   resolvable from the exact frozen dependency graph; undeclared package
   executables and downloaded-on-demand tools are invalid.
9. The `@stynx-nyx/privacy` ordinary test tier contains exactly its three unit
   specs and one wiring spec, while its serialized integration tier contains
   exactly its single integration spec. These populations are disjoint and
   their union is all five tests. Coverage continues to execute all five through
   its dedicated configuration without changing thresholds, timeouts, or
   unrelated task concurrency. The exact campaign boundary and role ownership
   are frozen in Decision D13 of the STYNX 1.1.1 campaign controls ADR.

## Release and security references

When release state is uncertain, inspect `docs/adopters/stynx/release-readiness.md`,
`docs/adopters/stynx/implementation-status.md`, and recent Git history before
making a claim. The repository-specific dependency audit procedure is retained
at `tools/npm-security-upgrade-auditor/`.
