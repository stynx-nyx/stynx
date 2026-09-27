# CTG-0002 repair contracts after Opus delivery-review cycle 1

Authority: Architect. Source: `docs/framework/contracts/sse-1.5.md`, DETRAN C-0002 §4/§7, OD-S15-01 and `reviews/ctg2-delivery-review-1.json`. All UPS-SSE-01…10, UPS-NGSSE-01…10 and UPS-TEST-01 remain MUST. Preserve every passing sensor. No worker may run Git, edit `law/`, any `package.json`, `.github/workflows`, or `scripts/verify-consumer-fixtures.mjs`, publish, push, or write in DETRAN. Root maestro alone commits by role, rebinds trace and public API baselines, and runs gates.

## Inspector B — backend and real RLS sensors

Own only `reference/api/test/integration/reference-sse.rls.integration.spec.ts` and `packages/backend/test/unit/event-stream.service.spec.ts`. Write failing sensors first, without production edits:

1. In the same real Nest/PostgreSQL two-tenant scenario, `Last-Event-ID: a-recent` resumes and delivers a later A row, with no repeated a-recent, expired or B frame. For unknown `b-private`, inspect body after a tick: no A/B replay before a newly inserted A row, and the new A row arrives. Keep positive and negative proof in the same RLS case.
2. Exercise service-level empty tenant and empty actor through a test route, assert exact 400/401 codes, absence of SSE headers, and a spy/counter proving zero `RlsSource.now`, `findById` and `listSince` calls. The existing Host/header conflict test remains distinct.
3. Fire a scheduled A tick inside `database.withRequestContext` for tenant B; assert the ambient snapshot is B at fire time, then prove A delivery and B non-disclosure without inherited request context.
4. Unit sensors for deterministic poison rows (unsafe ID or event, project throw/undefined/non-serializable value) progressing to later rows. Assert safe IDs emit `: dropped <id>`, unsafe IDs emit no marker or CR/LF, and every drop increments counters and calls the metrics sink; source read errors still leave cursor unchanged. Unit sensor for `onModuleDestroy` ending open HTTP responses and releasing slots/timers.

Run focused tests with `STYNX_TEST_PG_*` and report expected failures. Stop before implementation. Do not weaken assertions or modify generated files.

## Inspector A — Angular and consumer sensors

Own only `packages-web/angular/test/event-stream-lifecycle.spec.ts`, `packages-web/angular/test/event-stream-http.spec.ts`, and a new `test/scripts/angular-testing-consumer.test.mjs`. Write failing sensors first, without production edits:

1. Copy or pack the already turbo-built `packages-web/angular/dist` and its package export map into `mkdtemp`; do not run `ng-packagr` or write into the shared package tree from the sensor. Pack the Angular package and prove `@stynx-nyx/angular/testing` resolves through its exports map in a package consumer: runtime ESM import of both fakes and TypeScript resolution of the testing declaration under bundler or Node16. It must fail if either APF FESM or d.ts is missing. Avoid source aliases, a bare file-existence-only check and registry access. Resolve from a temporary offline consumer wired to workspace peers/dependencies. Import both fakes as ESM through the package exports map and compile consumer imports under TypeScript `moduleResolution: bundler` and `node16`. Use a temporary consumer `package.json` with `type: module`. Never skip, todo or return early: missing dist, workspace peer or TypeScript binary is a failing assertion. Remove each packed APF artifact in separate negative cases to prove that missing FESM or declaration fails.
2. Lifecycle tests for an internal, non-exported 1024-ID dedup window: an ID inside the window remains deduplicated across reconnect and an evicted oldest ID can be accepted after 1024 newer IDs, proving bounded retention without a new public config. Test incremental byte accounting on suffixes only, including multibyte characters split across cumulative progress chunks. A 204 reconnect delay must be at least `initialMs` (default 1_000 and one custom value).
3. HTTP chain test for rejected refresh or SDK UnauthorizedError becoming terminal `stopped`, without endless reconnect/polling. Preserve existing successful-refresh and no-banner assertions.

Run focused tests and report observed results. The positive consumer case may pass immediately because the missing proof was the gated sensor; its negative artifact-removal cases must fail as expected. Stop before implementation. No Git or generated-file edits. `scripts/verify-consumer-fixtures.mjs`, all `package.json` files and `.github/workflows` are out of scope for every worker.

## Engineer B — backend repair after Inspector B

Own only `packages/backend/src/event-stream/**`. The empty-scope route, RlsSource query spy/counter and ambient scheduler wrapper belong to Inspector B in the integration spec; Engineer B does not edit reference API. Keep source read failure retry semantics; drop deterministic per-row failures, advance cursor safely and count metrics. End open responses during module shutdown. Run backend unit plus real reference API integration. Do not edit tests, `law/`, package baselines, any `package.json`, `.github/workflows` or Git.

## Engineer A — Angular repair after Inspector A

Own `packages-web/angular/src/**`, `packages-web/angular/testing/**`, `packages-web/angular/ng-package.json`, and the hand-editable portions of `packages-web/angular/README.md` and `packages/backend/README.md`, and `.changeset/sse-stream-15.md`. Document tenancy in the Angular provider example; backend `StynxEventStreamModule.forRoot`, the data Database context runner, manual `@Res()` without interceptors, source ordering and FORCE RLS. The changeset must point to real documentation. The `packages-web/angular/package.json` exports map is frozen; any required change goes back to the Architect. The new `test/scripts/*.test.mjs` sensor is already in `stynx-script-tests` and `ci:stynx`; no gate wiring edit is needed. Bound dedup; account only new bytes; clamp 204 delay; classify SDK/rejected-refresh auth terminal. Run Angular tests/build and consumer sensor. Do not edit tests, `law/`, generated README sections, any `package.json`, `.github/workflows` or Git. If wiring truly needs a manifest or workflow edit, return it to the Architect without changing it.

The maestro runs `pnpm package-readmes:write` after documentation edits, `pnpm check:trace --print` and trace rebind after Inspector commits, `pnpm api:baselines:write` if public API changes, `pnpm check:rls-negative`, `pnpm test:int`, `pnpm ci:reference-apps`, `pnpm ci:stynx`, then a new Opus delivery-review. Independent Inspector B and A tasks have disjoint files and may run concurrently; Engineer tasks run only after their respective Inspector work is committed.
