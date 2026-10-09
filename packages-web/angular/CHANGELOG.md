# @stynx-nyx/angular

## 1.5.6

### Patch Changes

- 4a4167b: Add the opt-in `StynxEventStreamConfig.openStatus` option (UPS-NGSSE-13, item 3
  of #321). With `'first-line'`, opening a connection no longer sets the status at
  once: the status it would have set (`live`, `reconnecting` or `polling`) is held
  for that connection and applied by its first received line, before any frame or
  comment handling, so a frame or a live comment on that line still wins. The
  first `start()`, and a `start()` after `stop()`, wait in `idle`; a tenant change
  and an immediate end-of-stream reopen keep the previous status; a planned age or
  byte reopen keeps `live`. The silence timer still runs from the open, so a
  reopen that receives nothing counts a failure after `heartbeatMs × staleFactor`.
  Lines from a connection a subscriber already stopped or replaced are ignored.
  `'immediate'`, the default, keeps the 1.5.0 behavior, and any other value is
  rejected by `provideStynxEventStream`.
  - @stynx-nyx/angular-tenancy@1.5.6
  - @stynx-nyx/sdk@1.5.6

## 1.5.5

### Patch Changes

- @stynx-nyx/angular-tenancy@1.5.5
- @stynx-nyx/sdk@1.5.5

## 1.5.4

### Patch Changes

- 4642547: Add the opt-in `StynxEventStreamConfig.serverClose` policy for a stream the
  server ends without an error (UPS-NGSSE-12). `ok: 'end-of-stream'` keeps a 200
  response whose body ends out of the failure window, so it never leads to polling
  by itself. `cursor: 'discard'` drops `Last-Event-ID` on that 200 and emits
  `resync$` with the reason `'server-close'`, which 1.5.3 reserved without
  emitting. `reopen` sets the delay after a close that is not a failure (a 204,
  or a 200 under `'end-of-stream'`): `'backoff'`, `'immediate'`, or
  `'immediate-after-frame'`, which reopens at once only when the closed connection
  delivered a frame. Every omitted field keeps the 1.5.0 behavior, and a 204 still
  always discards the cursor. `FakeStynxEventStreamTransport.respond()` now
  completes the connection it responded on instead of one opened by a synchronous
  reopen.
  - @stynx-nyx/angular-tenancy@1.5.4
  - @stynx-nyx/sdk@1.5.4

## 1.5.3

### Patch Changes

- bccd834: Build and test the Angular packages against Angular 22.2.1, the release that fixes
  GHSA-ff3f-86qr-9cv3 (`@angular/router` SSR denial of service). The supported
  peer range stays `>=22.0.0 <23`; consumers on 22.0–22.1 should upgrade their
  own Angular install to 22.2.0 or later.
- 3324e19: Add opt-in `StynxEventStreamConfig` options and service members for SSE
  consumers (UPS-NGSSE-11, -13, -14, -15). `reopenOnPollingEntry: 'backoff'`
  schedules the reopen that enters polling on the normal retry delay instead of
  immediately. `commentActivity: 'live'` lets SSE comment lines such as
  `: heartbeat` return the stream to `live` and clear failure counters.
  `retryAfterFrom(error, body)` adds a retry delay read from an HTTP error body;
  the reopen waits for the largest of backoff, `Retry-After` and that delay.
  `StynxEventStreamService` gains `resync$`, emitted once when a held cursor is
  discarded by a 204 or a tenant change (the reason type also reserves
  `'server-close'`, not emitted in 1.5.x), and `lastError`, a signal holding the
  most recent transport error. The built-in transport now sends
  `Accept: text/event-stream`. Every new option defaults to the 1.5.0
  behavior, and `FakeStynxEventStreamTransport.error()` accepts an optional
  response body.
- 7fce995: Honor `Retry-After` when a 429 is the failure that moves
  `StynxEventStreamService` into polling. The client previously reopened the
  stream immediately on entering polling and skipped the `Retry-After` delay; it
  now waits `max(backoff, Retry-After)` as the SSE contract requires. Entering
  polling without `Retry-After` still reopens immediately.
- Updated dependencies [bccd834]
- Updated dependencies [d98960b]
  - @stynx-nyx/angular-tenancy@1.5.3
  - @stynx-nyx/sdk@1.5.3

## 1.5.2

### Patch Changes

- @stynx-nyx/angular-tenancy@1.5.2
- @stynx-nyx/sdk@1.5.2

## 1.5.1

### Patch Changes

- @stynx-nyx/angular-tenancy@1.5.1
- @stynx-nyx/sdk@1.5.1

## 1.5.0

### Minor Changes

- 138f7f0: Add a scoped NestJS SSE stream service with explicit per-tick request context,
  cursor replay, bounded connection and payload handling, and observability.
  Add an Angular SSE client using the normal HTTP interceptors, controlled
  reconnection and polling, session and tenant lifecycle, and public test
  doubles. The fixed STYNX package group advances together.

  Consumers supply an RLS-scoped event source and a session-active Signal;
  configure `StynxEventStreamModule.forRoot({ contextRunner })` with a lazy
  adapter to the concrete data `Database` on the server and
  `provideStynxEventStream(...)` in Angular. The real public
  symbols and full wiring are documented in
  `packages/backend/README.md#server-sent-events`,
  `packages-web/angular/README.md#server-sent-events`, and
  `docs/framework/contracts/sse-1.5.md`.

- 8a800c2: Add raw-body HMAC webhook verification with atomic replay protection, a Nest
  guard that clears unverified identity, an injectable clock, a tenant business
  calendar using host-provided timezones and holidays, and opt-in Angular
  idempotency keys for marked commands. The fixed STYNX package group advances
  together.

  Consumers must send `sha256=` prefixed signatures, provide a shared replay
  store, and configure Nest raw-body capture. Business-day deadlines end at the
  exclusive start of the following local civil date; hosts must supply their own
  tenant-scoped holiday data.

  Angular consumers register `provideStynxIdempotency()` once with
  `withInterceptorsFromDi()` and mark each mutating request explicitly. Body
  hashing requires a plain JSON object or array; existing idempotency headers
  remain authoritative.

- 5aea8af: Add strong revision `If-Match` parsing, method-scoped 428/412 law errors and
  successful-response ETags to Nest routes. Add Angular error classification and
  banner handling, an accessible localized shell, and published auth, i18n and
  transaction testing helpers. The fixed STYNX package group advances together.

  Apply `@RequireIfMatch()` and `@IfMatchRevision()` to revision-protected methods;
  the consumer still performs the atomic revision check and throws
  `PreconditionFailedError` on a stale value. Add `@RevisionETag()` only when the
  successful body has a safe integer `revision`. For transactional commands,
  validate that revision before the command commits. Install app-owned i18n
  catalogs and provide tenant-qualified shell theme storage keys when a shared
  browser can switch tenants.

### Patch Changes

- Updated dependencies [5aea8af]
  - @stynx-nyx/sdk@1.5.0
  - @stynx-nyx/angular-tenancy@1.5.0

## 1.5.0-rc.3

### Patch Changes

- @stynx-nyx/angular-tenancy@1.5.0-rc.3
- @stynx-nyx/sdk@1.5.0-rc.3

## 1.5.0-rc.2

### Minor Changes

- 138f7f0: Add a scoped NestJS SSE stream service with explicit per-tick request context,
  cursor replay, bounded connection and payload handling, and observability.
  Add an Angular SSE client using the normal HTTP interceptors, controlled
  reconnection and polling, session and tenant lifecycle, and public test
  doubles. The fixed STYNX package group advances together.

  Consumers supply an RLS-scoped event source and a session-active Signal;
  configure `StynxEventStreamModule.forRoot({ contextRunner })` with a lazy
  adapter to the concrete data `Database` on the server and
  `provideStynxEventStream(...)` in Angular. The real public
  symbols and full wiring are documented in
  `packages/backend/README.md#server-sent-events`,
  `packages-web/angular/README.md#server-sent-events`, and
  `docs/framework/contracts/sse-1.5.md`.

### Patch Changes

- @stynx-nyx/angular-tenancy@1.5.0-rc.2
- @stynx-nyx/sdk@1.5.0-rc.2

## 1.5.0-rc.1

### Patch Changes

- @stynx-nyx/sdk@1.5.0-rc.1
- @stynx-nyx/angular-tenancy@1.5.0-rc.1

## 1.4.0

### Minor Changes

- 1565d4e: Adopt DEVAI 1.5.0 and its release profile 1.4.0, keeping mutation testing as
  optional manual hardening outside all CI, acceptance, and publication gates.

### Patch Changes

- Updated dependencies [1565d4e]
  - @stynx-nyx/angular-tenancy@1.4.0
  - @stynx-nyx/sdk@1.4.0

## 1.3.1

### Patch Changes

- 773ad90: Release tooling: the 1.3.0 CHANGELOG sections list sibling packages as `@2.0.0` under "Updated dependencies"; Changesets' peer-dependency inference had computed 2.0.0 before the version was corrected to 1.3.0 by hand. The references now read `@1.3.0`. The workspace `version-packages` script applies the fixed-group version rule from now on (the highest bump a changeset declares for a group member; a peer-inferred major is corrected in manifests and changelogs). No public API or runtime behaviour changes.
- Updated dependencies [773ad90]
  - @stynx-nyx/angular-tenancy@1.3.1
  - @stynx-nyx/sdk@1.3.1

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
  - @stynx-nyx/angular-tenancy@1.3.0
  - @stynx-nyx/sdk@1.3.0

## 1.2.0

### Unified Version Rebaseline

- Advance the canonical STYNX 1.x line to exact version 1.2.0 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.1.1

### Unified Version Rebaseline

- Re-establish the canonical STYNX 1.x line at exact version 1.1.1 for the complete 44-package fixed group without changing runtime behavior or public contracts.

## 1.0.0

### Patch Changes

- @stynx-nyx/sdk@1.0.0
- @stynx-nyx/angular-tenancy@1.0.0

## 0.5.0

### Unified Version Rebaseline

- Align the STYNX root workspace and every public package on the shared 0.5.0 release line without changing runtime behavior or public contracts.

## 1.0.4

### Patch Changes

- 0a5a49a: Publish the post-v1 package changes already proven on main: additive Angular
  and backend APIs, regenerated SDK contracts, tenant-scoped preferences/data
  runtime behavior, dependency-advisory remediation, and the PostgreSQL test-app
  readiness fix. Test-only mutation and timeout stabilization does not expand the
  release roster.
- Updated dependencies [0a5a49a]
  - @stynx-nyx/angular-tenancy@0.1.4
  - @stynx-nyx/sdk@1.1.0

## 1.0.3

### Patch Changes

- cc0f53e: License and authorship metadata in manifests: SPDX `license: "BUSL-1.1"` and
  `author: "Antonio Augusto Russo <aarusso@nyxk.com.br>"` added to every
  publishable package.json. No runtime changes.
- Updated dependencies [cc0f53e]
  - @stynx-nyx/angular-tenancy@0.1.3
  - @stynx-nyx/sdk@1.0.2

## 1.0.2

### Patch Changes

- 41a2a8b: Relicense: per-package LICENSE pointer files now reference the Business
  Source License 1.1 (see the repository LICENSE for parameters); package
  manifests and tarballs pick the new license text up from this release.
- Updated dependencies [41a2a8b]
  - @stynx-nyx/angular-tenancy@0.1.2
  - @stynx-nyx/sdk@1.0.1

## 1.0.1

### Patch Changes

- Updated dependencies [928d2fa]
  - @stynx-nyx/angular-tenancy@0.1.1

## 1.0.0

### Major Changes

- 8f6df55: Prepare the first `1.0.0` release line across every publishable STYNX and legacy compatibility package.

### Patch Changes

- Updated dependencies [8f6df55]
  - @stynx-nyx/sdk@1.0.0
