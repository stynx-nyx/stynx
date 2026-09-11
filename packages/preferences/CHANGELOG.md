# @stynx-nyx/preferences

## 1.2.1

### Patch Changes

- 32fc82c: Adopt the installed @aarusso-nyx/devai package as the only governance path.

  STYNX no longer carries a second governance implementation. Local
  release-candidate orchestration, the 1.1.1 campaign policy and schema, the
  mutation evidence composition and reuse engine, the direct verifier
  invocation, and the local RC and main-observation workflows are removed.
  Mutation execution remains a STYNX responsibility and continues to run the
  complete 38-package roster at the unchanged break: 90 floor.

  Also resolves 12 transitive dependency security advisories and unblocks
  @stynx-nyx/contracts mutation, which was prevented by Stryker scaffolding
  that had been committed by accident.

  No public API, runtime behavior, or package contract changes.

- Updated dependencies [32fc82c]
  - @stynx-nyx/core@1.2.1
  - @stynx-nyx/data@1.2.1
  - @stynx-nyx/idempotency@1.2.1

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.0.0

### Patch Changes

- Updated dependencies [bb469ee]
- Updated dependencies [0aa9695]
- Updated dependencies [e99b2cc]
  - @stynx-nyx/core@1.0.0
  - @stynx-nyx/data@1.0.0
  - @stynx-nyx/idempotency@1.0.0

## 0.5.0

### Unified Version Rebaseline

- Align the STYNX root workspace and every public package on the shared 0.5.0 release line without changing runtime behavior or public contracts.

## 0.3.0

### Minor Changes

- 0a5a49a: Publish the post-v1 package changes already proven on main: additive Angular
  and backend APIs, regenerated SDK contracts, tenant-scoped preferences/data
  runtime behavior, dependency-advisory remediation, and the PostgreSQL test-app
  readiness fix. Test-only mutation and timeout stabilization does not expand the
  release roster.

### Patch Changes

- Updated dependencies [0a5a49a]
  - @stynx-nyx/data@1.1.0
  - @stynx-nyx/idempotency@1.0.4

## 0.2.0

### Minor Changes

- d7a6c41: Add the closed tenant-subject preferences backend and align Angular profile
  types and writes with mandatory revision-aware ETags.
