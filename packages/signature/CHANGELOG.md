# @stynx-nyx/signature

## 0.2.2

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/integration-adapter@0.2.2

## 0.2.1

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/integration-adapter@0.2.1

## 0.2.0

### Minor Changes

- 99afc50: Add deterministic digest, PAdES evidence, GovBR sandbox, and sequential signing helpers for adopter-side signature workflows.
- d06e01c: Add XMLDSig signing, verification, tamper-detection, and fiscal XML fixtures for adopter DCTFWeb and EFD-Reinf workflows.
- de034f7: Add Round 1 shared module scaffolds for PAdES signatures, PDF rendering,
  tenant-scoped feature flags, and external integration adapters.

### Patch Changes

- 745c2dd: Support PEC Round 2 adoption of shared signature, PDF, feature-flag, and integration adapter runtimes.
- Updated dependencies [745c2dd]
- Updated dependencies [de034f7]
  - @stynx-nyx/integration-adapter@0.2.0

## 0.2.0

- Add XMLDSig signing and verification helpers for DCTFWeb and EFD-Reinf shaped
  fiscal XML payloads.
- Add typed tamper-detection results and adopter-facing XMLDSig contract docs.
