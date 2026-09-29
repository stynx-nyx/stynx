# @stynx-nyx/tenancy

## 1.5.1

### Patch Changes

- @stynx-nyx/contracts@1.5.1
- @stynx-nyx/core@1.5.1
- @stynx-nyx/data@1.5.1
- @stynx-nyx/idempotency@1.5.1

## 1.5.0

### Minor Changes

- 2a94cac: Initialize one request context before guards, add explicit public tenant routes with Host-based tenant selection and optional verified authentication, and reject conflicting tenant sources. The fixed STYNX package group advances together.

  Backend migration: replace application-specific public request seeds and global interceptor-order patches with `StynxTenancyModule.forRoot({ publicTenant: { resolveHost, actorId } })` and `@PublicTenantRoute()`. Keep the application's Host allow-list and configure proxy Host forwarding explicitly. The nominal `actorId` must be a valid UUID. Remove DETRAN prototype helpers `patchTenantContextInterceptorOrdering`, `seedPortalPublicRequest`, `request.portalPublic`, and `portalRequestHostStorage` after adopting this API.

- 7eec2d7: Add a transactional HTTP command boundary that commits an audit event and a durable idempotent response with the domain mutation in one tenant-scoped app-role transaction. The fixed STYNX package group advances together.

  Apply platform migration `0020_transactional_commands.sql` before enabling command routes. Configure a real `stynx_app` connection for the application pool; the command boundary checks the live database role, tenant and actor. Install `StynxTransactionalCommandModule.forRoot({ auditSink })` and mark protected routes with the built-in STYNX auth guard, `@TransactionalCommand()`, transactional `@Idempotent()` and transactional `@Audit()`. Public tenant commands require `StynxTenancyModule` and `@PublicTenantRoute()`.

  Migration 0020 revokes direct `audit.write` execution from `PUBLIC` and
  `stynx_app`. Legacy `AuditSqlSink` deployments using
  `audit_write_function` on unmarked routes must use an owner-role connection;
  the transactional command boundary uses the restricted
  `audit.write_command_event` wrapper on its app-role connection.

  Committed responses replay the exact JSON bytes, status, `location`, `retry-after`, `cache-control` and `etag` headers. Do not put cookies or per-request headers in a committed response. An unselected successful status commits the domain change and audit event while clearing its key; an unselected error rolls back. Legacy idempotency behavior remains available on routes without the transactional command marker.

  CTG5 command rejections now follow the STYNX error envelope with `statusCode`,
  `errorCode`, fixed public `message`, `requestId` matching `X-Request-Id`, and
  `retryable`; key conflicts include `details: { key }`. The default mismatch
  code is `IDEMPOTENCY:CONFLICT:duplicate-key`, and configured `mismatchCode`
  values must match the schema's `errorCode` pattern. Invalid module options or
  marked route metadata fail during bootstrap. Migrate pre-release CTG5 clients
  from `code`/`context` to `errorCode`/`details`. Existing data-layer errors,
  legacy idempotency 422 responses, and consumer-chosen response bytes are
  unchanged.

### Patch Changes

- Updated dependencies [c6ddb66]
- Updated dependencies [42bbb43]
- Updated dependencies [2a94cac]
- Updated dependencies [7eec2d7]
- Updated dependencies [8a800c2]
  - @stynx-nyx/contracts@1.5.0
  - @stynx-nyx/data@1.5.0
  - @stynx-nyx/core@1.5.0
  - @stynx-nyx/idempotency@1.5.0

## 1.5.0-rc.3

### Patch Changes

- Updated dependencies [c6ddb66]
  - @stynx-nyx/contracts@1.5.0-rc.3
  - @stynx-nyx/idempotency@1.5.0-rc.3
  - @stynx-nyx/core@1.5.0-rc.3
  - @stynx-nyx/data@1.5.0-rc.3

## 1.5.0-rc.2

### Patch Changes

- @stynx-nyx/contracts@1.5.0-rc.2
- @stynx-nyx/core@1.5.0-rc.2
- @stynx-nyx/data@1.5.0-rc.2
- @stynx-nyx/idempotency@1.5.0-rc.2

## 1.5.0-rc.1

### Minor Changes

- 2a94cac: Initialize one request context before guards, add explicit public tenant routes with Host-based tenant selection and optional verified authentication, and reject conflicting tenant sources. The fixed STYNX package group advances together.

  Backend migration: replace application-specific public request seeds and global interceptor-order patches with `StynxTenancyModule.forRoot({ publicTenant: { resolveHost, actorId } })` and `@PublicTenantRoute()`. Keep the application's Host allow-list and configure proxy Host forwarding explicitly. The nominal `actorId` must be a valid UUID. Remove DETRAN prototype helpers `patchTenantContextInterceptorOrdering`, `seedPortalPublicRequest`, `request.portalPublic`, and `portalRequestHostStorage` after adopting this API.

### Patch Changes

- Updated dependencies [2a94cac]
  - @stynx-nyx/core@1.5.0-rc.1
  - @stynx-nyx/contracts@1.5.0-rc.1
  - @stynx-nyx/data@1.5.0-rc.1
  - @stynx-nyx/idempotency@1.5.0-rc.1

## 1.4.0

### Minor Changes

- 1565d4e: Adopt DEVAI 1.5.0 and its release profile 1.4.0, keeping mutation testing as
  optional manual hardening outside all CI, acceptance, and publication gates.

### Patch Changes

- Updated dependencies [1565d4e]
  - @stynx-nyx/contracts@1.4.0
  - @stynx-nyx/core@1.4.0
  - @stynx-nyx/data@1.4.0
  - @stynx-nyx/idempotency@1.4.0

## 1.3.1

### Patch Changes

- 773ad90: Release tooling: the 1.3.0 CHANGELOG sections list sibling packages as `@2.0.0` under "Updated dependencies"; Changesets' peer-dependency inference had computed 2.0.0 before the version was corrected to 1.3.0 by hand. The references now read `@1.3.0`. The workspace `version-packages` script applies the fixed-group version rule from now on (the highest bump a changeset declares for a group member; a peer-inferred major is corrected in manifests and changelogs). No public API or runtime behaviour changes.
- Updated dependencies [773ad90]
  - @stynx-nyx/contracts@1.3.1
  - @stynx-nyx/core@1.3.1
  - @stynx-nyx/data@1.3.1
  - @stynx-nyx/idempotency@1.3.1

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
  - @stynx-nyx/contracts@1.3.0
  - @stynx-nyx/core@1.3.0
  - @stynx-nyx/data@1.3.0
  - @stynx-nyx/idempotency@1.3.0

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
