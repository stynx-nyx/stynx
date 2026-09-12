# @stynx-nyx/data

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
  - @stynx-nyx/core@2.0.0

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.0.0

### Minor Changes

- 0aa9695: Add tenant-scoped notification delivery with versioned templates, SES/SNS adapters,
  in-app inbox delivery, preference suppression, and retryable tracking.
- e99b2cc: Add the tenant-scoped worklist package with RBAC-derived queue eligibility,
  atomic claiming, extensible distribution strategies, audited reassignment and
  supervisor overrides, and absolute or business-day SLA clocks.

### Patch Changes

- Updated dependencies [bb469ee]
  - @stynx-nyx/core@1.0.0

## 0.5.0

### Unified Version Rebaseline

- Align the STYNX root workspace and every public package on the shared 0.5.0 release line without changing runtime behavior or public contracts.

## 1.1.0

### Minor Changes

- 0a5a49a: Publish the post-v1 package changes already proven on main: additive Angular
  and backend APIs, regenerated SDK contracts, tenant-scoped preferences/data
  runtime behavior, dependency-advisory remediation, and the PostgreSQL test-app
  readiness fix. Test-only mutation and timeout stabilization does not expand the
  release roster.

## 1.0.2

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/core@1.0.2

## 1.0.1

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/core@1.0.1

## 1.0.0

### Major Changes

- 8f6df55: Prepare the first `1.0.0` release line across every publishable STYNX and legacy compatibility package.

### Patch Changes

- Updated dependencies [8f6df55]
  - @stynx-nyx/core@1.0.0
