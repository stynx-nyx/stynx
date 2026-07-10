# @stynx-nyx/pdf-a-vera-docker

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
