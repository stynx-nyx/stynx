# @stynx-nyx/jobs

## 1.3.1

### Patch Changes

- 773ad90: Release tooling: the 1.3.0 CHANGELOG sections list sibling packages as `@2.0.0` under "Updated dependencies"; Changesets' peer-dependency inference had computed 2.0.0 before the version was corrected to 1.3.0 by hand. The references now read `@1.3.0`. The workspace `version-packages` script applies the fixed-group version rule from now on (the highest bump a changeset declares for a group member; a peer-inferred major is corrected in manifests and changelogs). No public API or runtime behaviour changes.
- Updated dependencies [773ad90]
  - @stynx-nyx/core@1.3.1
  - @stynx-nyx/data@1.3.1

## 1.3.0

### Minor Changes

- 1946efc: Angular 22. The Angular packages are built with @angular/compiler-cli 22.1.6, ng-packagr 22.1 and TypeScript 6.0.3, and their peer ranges move from `>=20.3.0 <22` to `>=22.0.0 <23`. Owner decision 2026-09-12: this ships as the 1.3.0 line. **1.3.x requires Angular 22**; applications on Angular 20 or 21 must stay on 1.2.x. Backend packages in the fixed group are re-released unchanged.

  The published declaration files of nine Angular packages also change: the previous ng-packagr 21 / TypeScript 5.9 toolchain dropped `| null` and `| undefined` from emitted generic type arguments (for example `Signal<ErrorBannerState>` where the source declares `Signal<ErrorBannerState | null>`, `InjectionToken<AuthProvider>` for `InjectionToken<AuthProvider | null>`). Angular 22 emits the types as written in the sources. Consumers that relied on the narrower, incorrect declarations will see new strict-null errors; the runtime behaviour is unchanged.

### Patch Changes

- a56760d: Dependency round 2026-09 (part 2): NestJS 11.2.3 workspace-wide (test and reference dependencies; peer ranges unchanged), AWS SDK 3.1068+, nestjs-cls 6.2.1, intl-messageformat 11.2.8, and the shared toolchain (eslint 10.5, typescript-eslint 8.61, swc 1.15.41, turbo 2.9.18, prettier 3.8.4, knip 6.16, typedoc-plugin-markdown 4.12, Docusaurus 3.10.2, react 19.2.7). No public API or runtime behaviour changes.
- e45bfb9: Dependency round 2026-09 (part 3, tooling majors): @types/node 24.13.4 across the publishable packages (tracking the Node 24 engine pin), testcontainers 12, commander 15 (ESM-only; consumed via require(esm) on Node 24), commitlint 21, lint-staged 17, eslint-plugin-jsdoc 63. No public API or runtime behaviour changes.
- e639fa0: Dependency round 2026-09: rebuild the Angular libraries with @angular/compiler-cli 21.2.20 (partial-compilation output embeds the compiler version), and advance the workspace advisory overrides (js-yaml 3.15.2/4.3.2, multer 2.3.0, svgo 3.3.5, smol-toml 1.7.1). No public API or runtime behaviour changes.
- 9df17e7: node-redis 5 -> 6 in @stynx-nyx/auth, idempotency, ratelimit, sessions and testing. The four Redis-backed stores now create their clients with `RESP: 2` explicitly, so the wire protocol, reply shapes and the Redis server requirement are exactly as in 1.2.x (node-redis 6 defaults to RESP3, which would otherwise require Redis >= 6 on the server side). Switching STYNX to RESP3 is a separate, documented decision. No public API or runtime behaviour changes.
- 1b41c89: Dependency round 2026-09 (test runner): the workspace test runner moves from vitest 3.2.7 to vitest 4.1.11 with @vitest/coverage-v8 4.1.11. Test-only change: the shared Vitest base config adopts the Vitest 4 pool options (`maxWorkers: 1` + `isolate: false` replaces `poolOptions.threads.singleThread`; `minWorkers` is dropped) with the same single-thread and per-file-fork behaviour, pins each package's coverage population to its own directory (Vitest 4 otherwise lets a sibling package whose directory name extends the current one leak into the report), and constructor mocks in four specs move to `function` implementations. Coverage thresholds are unchanged; the more accurate Vitest 4 remapping exposed previously uncounted gaps, which are closed by additional unit tests. No public API or runtime behaviour changes.
- Updated dependencies [1946efc]
- Updated dependencies [a56760d]
- Updated dependencies [e45bfb9]
- Updated dependencies [e639fa0]
- Updated dependencies [9df17e7]
- Updated dependencies [1b41c89]
  - @stynx-nyx/core@1.3.0
  - @stynx-nyx/data@1.3.0

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.0.0

### Minor Changes

- 695d0fc: Add tenant-scoped Postgres background-job scheduling and worker runtime (E2).

### Patch Changes

- Updated dependencies [bb469ee]
- Updated dependencies [0aa9695]
- Updated dependencies [e99b2cc]
  - @stynx-nyx/core@1.0.0
  - @stynx-nyx/data@1.0.0
