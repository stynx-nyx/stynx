# @stynx-nyx/angular-sessions

## 0.5.0

### Unified Version Rebaseline

- Align the STYNX root workspace and every public package on the shared 0.5.0 release line without changing runtime behavior or public contracts.

## 1.1.1

### Patch Changes

- 0a5a49a: Publish the post-v1 package changes already proven on main: additive Angular
  and backend APIs, regenerated SDK contracts, tenant-scoped preferences/data
  runtime behavior, dependency-advisory remediation, and the PostgreSQL test-app
  readiness fix. Test-only mutation and timeout stabilization does not expand the
  release roster.
- Updated dependencies [0a5a49a]
  - @stynx-nyx/angular-auth@1.0.4
  - @stynx-nyx/angular-i18n@1.1.0
  - @stynx-nyx/angular-ui@1.0.4
  - @stynx-nyx/angular@1.0.4

## 1.1.0

### Minor Changes

- d7a6c41: Add provider-neutral logical-session inventory and revocation control, deterministic
  Cognito-compatible adapter contracts, and additive status-aware Angular APIs while
  preserving the existing issuance and route contracts.

## 1.0.3

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/angular@1.0.3
  - @stynx-nyx/angular-auth@1.0.3
  - @stynx-nyx/angular-i18n@1.0.2
  - @stynx-nyx/angular-ui@1.0.3

## 1.0.2

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/angular-auth@1.0.2
  - @stynx-nyx/angular-i18n@1.0.1
  - @stynx-nyx/angular-ui@1.0.2
  - @stynx-nyx/angular@1.0.2

## 1.0.1

### Patch Changes

- @stynx-nyx/angular@1.0.1
- @stynx-nyx/angular-auth@1.0.1
- @stynx-nyx/angular-ui@1.0.1

## 1.0.0

### Major Changes

- 8f6df55: Prepare the first `1.0.0` release line across every publishable STYNX and legacy compatibility package.

### Patch Changes

- Updated dependencies [8f6df55]
  - @stynx-nyx/angular@1.0.0
  - @stynx-nyx/angular-auth@1.0.0
  - @stynx-nyx/angular-ui@1.0.0
