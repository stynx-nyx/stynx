# @stynx-nyx/tenancy

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
  - @stynx-nyx/contracts@1.2.1
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
  - @stynx-nyx/contracts@1.0.0

## 0.5.0

### Unified Version Rebaseline

- Align the STYNX root workspace and every public package on the shared 0.5.0 release line without changing runtime behavior or public contracts.

## 1.0.4

### Patch Changes

- Updated dependencies [0a5a49a]
  - @stynx-nyx/data@1.1.0
  - @stynx-nyx/idempotency@1.0.4

## 1.0.3

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/contracts@1.0.3
  - @stynx-nyx/core@1.0.2
  - @stynx-nyx/data@1.0.2
  - @stynx-nyx/idempotency@1.0.3

## 1.0.2

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/contracts@1.0.2
  - @stynx-nyx/core@1.0.1
  - @stynx-nyx/data@1.0.1
  - @stynx-nyx/idempotency@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [928d2fa]
  - @stynx-nyx/contracts@1.0.1
  - @stynx-nyx/idempotency@1.0.1

## 1.0.0

### Major Changes

- 8f6df55: Prepare the first `1.0.0` release line across every publishable STYNX and legacy compatibility package.

### Patch Changes

- Updated dependencies [8f6df55]
  - @stynx-nyx/core@1.0.0
  - @stynx-nyx/data@1.0.0
  - @stynx-nyx/idempotency@1.0.0
