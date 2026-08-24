# @stynx-nyx/pdf-a-vera-docker

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 38-package fixed group without changing runtime behavior or public contracts.

## 0.5.0

### Unified Version Rebaseline

- Align the STYNX root workspace and every public package on the shared 0.5.0 release line without changing runtime behavior or public contracts.

## 0.2.2

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/logging@1.0.2
  - @stynx-nyx/pdf-a@0.2.2

## 0.2.1

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/logging@1.0.1
  - @stynx-nyx/pdf-a@0.2.1

## 0.2.0

### Minor Changes

- 2053d9e: Add the digest-pinned veraPDF Docker validator adapter, JSON report
  normalization, Docker timeout handling, fixture corpus, and bench gate.

  Adoption notes: this package requires Docker runtime access. Existing PDF bytes
  are unchanged; adopters wire the adapter behind the `@stynx-nyx/pdf-a` contract and
  may override the pinned image only through explicit environment policy.

### Patch Changes

- Updated dependencies [2053d9e]
  - @stynx-nyx/pdf-a@0.2.0

## 0.1.0

- Add the digest-pinned veraPDF Docker validator adapter, report parser,
  Docker runner wrapper, fixture corpus tests, and throughput bench gate.
