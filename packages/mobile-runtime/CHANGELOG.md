# @stynx-nyx/mobile-runtime

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

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.0.0

### Minor Changes

- f90c5a6: Promote TEAT's proven offline-first mobile orchestration into a framework-free runtime with
  consumer-defined entity types and a sandbox adapter test kit.

## 0.5.0

### Minor Changes

- Promote TEAT's proven offline mobile runtime into a framework-free, entity-generic STYNX package
  with an isolated sandbox test kit.
