# C-4 pilot phase — Vitest cutover (V6 + V7) retro

> **Phase outcome:** all Jest removed from the workspace; Vitest is the single
> test runner. Recorded: 2026-05-18.

This retro captures what V6 (cutover) + V7 (cleanup) actually involved on
stynx, what went well, what surprised us, and what the next adopter should
expect. It's the post-mortem to the parallel-adoption ledger in
[`docs/meta/ops/vitest-parallel-adoption.md`](../../../meta/ops/vitest-parallel-adoption.md).

## What changed (top-line)

| Surface                   | Before V6                                                                                                                                                            | After V6                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Unit runner               | Jest 30 via [`jest.config.cjs`](https://www.npmjs.com/package/jest) per package                                                                                      | Vitest 3 via `vitest.config.ts` per package     |
| Integration runner        | Jest 30 via `jest.integration.config.cjs` per package                                                                                                                | Vitest 3 via `vitest.int.config.ts` per package |
| Mutation runner           | Stryker + `@stryker-mutator/jest-runner`                                                                                                                             | Stryker + `@stryker-mutator/vitest-runner`      |
| Per-package scripts       | `test`: Jest · `test:vt`: Vitest (parallel window)                                                                                                                   | `test`: Vitest (only)                           |
| Compat shims              | `jest.setup.vi-shim.cjs` + `vitest.setup.compat.ts` (V0–V5 only)                                                                                                     | both gone                                       |
| Workspace devDeps removed | `jest`, `@types/jest`, `ts-jest`, `jest-environment-jsdom`, `jest-preset-angular`, `@jest/globals`, `@stryker-mutator/jest-runner` (≥7 deps across 35 package.jsons) | —                                               |
| Spec files touched        | ~120 by the `jest.* → vi.*` codemod + ~26 by the `jest.Mock` type rewrite                                                                                            | end state: zero `jest.*` references in code     |
| Test count at cutover     | 1,034 unit + 57 integration = **1,091** (100% PARITY at V5)                                                                                                          | identical, all passing on Vitest                |

## Parity baseline → cutover delta

The V5 hardening window ended with **48/48 packages at PARITY**. The cutover
sweep (Vitest-only) preserves every test: same counts, same pass/fail per
file. Baselines snapshotted in
[`docs/adopters/pilots/c-4/vitest-cutover-baselines/`](vitest-cutover-baselines/).

Mutation re-baseline (verified): `@stynx-nyx/contracts` post-cutover **83.33%** —
identical to the pre-cutover value. The other three baselined packages
(`@stynx-nyx/core`, `@stynx-nyx/audit`, `@stynx-nyx/angular-tenancy`) should be
re-measured on the new runner; protocol in
[`vitest-cutover-baselines/README.md`](vitest-cutover-baselines/README.md).

## What worked

1. **Parallel adoption made the cutover boring.** By the time V6 started, every
   spec already passed under both runners. The cutover was a deletion exercise
   plus a codemod, not a debugging exercise. The transient compat shims
   (`jest.setup.vi-shim.cjs`, `vitest.setup.compat.ts`) were load-bearing
   during V0–V5 and removable at V6 without follow-up.
2. **SWC-driven transform.** `unplugin-swc` with `emitDecoratorMetadata: true`
   handled every NestJS DI test and Angular spec without per-package fiddling.
   This is the single biggest reason V3 (Angular) finished in a day.
3. **No `@analogjs/vitest-angular`.** Inventory turned up zero `TestBed`
   call sites in stynx's Angular packages; the standard `createVitestConfig`
   with `environment: 'jsdom'` + an `rxjs` CJS alias was enough.
4. **Codemods as scripts, not regex pyramids.** Two short Node scripts
   (`jest.* → vi.*` rename + `jest.Mock` type rewrite) covered ~150 files.
   A multi-line follow-up pass caught the `jest\n  .fn(...)` cases the
   single-line regex missed.

## What surprised us

1. **drizzle's `is()` walks prototype chains.** `export * as <ns>` in
   [`packages/data/src/schema/index.ts`](../../../../packages/data/src/schema/index.ts)
   produced Module-namespace objects with `null` prototypes under ESM — and
   drizzle's entity check throws on those. Fix landed as a small source
   change (dead `export * as` re-exports removed) plus a defensive
   [`drizzle-entity-shim.mjs`](../../../../tools/repo-config/drizzle-entity-shim.mjs).
   The shim stayed for belt-and-braces.
2. **`jest.requireActual` is sync and Vitest has nothing equivalent.** Only
   one spec used it ([`packages/auth/test/unit/validators.spec.ts`](../../../../packages/auth/test/unit/validators.spec.ts)).
   Converting to `await vi.importActual(...)` requires the test body to be
   async. Trivial when there's just one call site; would be more painful at
   scale.
3. **`vi.restoreAllMocks` ≠ `jest.restoreAllMocks`.** Vitest's wipes factory
   mock implementations; Jest's preserves them. The
   [storage `s3.service` spec](../../../../packages/storage/test/unit/s3.service.spec.ts)
   broke until we routed `restoreAllMocks` → `clearAllMocks` in the codemod.
   The behaviour is now baked into the post-cutover spec.
4. **`require()` inside test bodies.** Three specs (one in `reference/api`,
   two in `domain/demo-bookmark/api`) used `require('@stynx-nyx/core').RequestContext`
   to get a class reference for NestJS DI lookups. Under Vitest's ESM-first
   resolver, `require()` returns a different class instance than `import` — DI
   fails. Fix was per-call-site `import { RequestContext } from '@stynx-nyx/core'`
   at the top of the file. Easy, but only obvious once you've already lost two
   hours to "could not find provider RequestContext".
5. **Vitest 3 has no `vi.isolateModules`.** One spec used `jest.isolateModules`
   to re-evaluate modules with fresh env vars. Replaced with `vi.resetModules()
   - await import(...)`in an async test body. Works in both runners (Jest got`NODE_OPTIONS=--experimental-vm-modules` via the parity script).
6. **`vi.dontMock` doesn't exist.** Aliased to `vi.unmock` in the codemod;
   close enough semantic match.
7. **pnpm hoisting + Vitest's resolver.** Vitest's bare-import resolver
   doesn't traverse to `.pnpm/node_modules/`; transitive devDeps (e.g.
   `@nestjs/testing` in packages that don't list it) fail to resolve. Fixed
   with a `resolveId` Vite plugin that walks up to the workspace's hoisted
   root. **Adopters with strict pnpm `hoistingLimits` won't hit this;
   adopters with lax peer dependency policies will.**

## Things that became obvious after the cutover

1. **`test/frontend/` was vestigial.** Its `jest.config.cjs` pointed at a
   `frontend/` directory that hasn't existed at the workspace root. We
   deleted the entire `test/frontend/` tree at V6. Worth a one-time
   inventory walk through any adopter's `test/` directory before V4.
2. **Several packages had `@jest/globals` even though their specs already
   used `globals: true`.** Removed; no spec broke.
3. **Dependabot grouping config referenced jest packages explicitly.**
   Replaced with a Vitest group. Future Vitest 3 → 4 upgrades will batch.
4. **`@stynx-nyx/testing`'s `dist/` shipped CJS, which collided with ESM-resolved
   imports from spec files.** The fix lived in `server.deps.inline:
[/@stynx\//]` for both unit + integration configs. Kept post-cutover.

## Trim list (what could be removed next)

- The drizzle entity shim + `patchDrizzle: true` flag — defensive, currently
  used only by `packages/data`. Decide whether the source-level schema fix is
  sufficient before V7.5.
- `server.deps.inline` patterns — `@aws-sdk/` was added during V0–V2 for
  `s3-request-presigner` mocks. May be removable now that specs use
  `vi.mock` directly.
- The Vitest type-import we inserted (`import type { Mock } from 'vitest'`)
  in 26 specs — works but could be replaced with `import { vi } from 'vitest'`
  in the few specs that already need it for runtime APIs.

## Recommended next steps for adopters

1. **Run the parallel-adoption playbook first** (V0–V5 in the linked doc).
   Don't go straight to V6 — the parity gate's whole purpose is to catch the
   half-dozen semantic differences above before you delete Jest.
2. **Survey for `TestBed` in your Angular packages.** If you have any,
   the V3 path requires `@analogjs/vitest-angular`. If not, the lightweight
   path works.
3. **Take a mutation baseline now**, before any infra changes. Stryker on
   Jest produces different numbers than Stryker on Vitest because each runner
   reports tests slightly differently — the baseline is your tripwire.
4. **Check your pnpm hoisting settings.** If `hoist-pattern` or
   `hoist-limits` is strict, you'll likely need the workspace-fallback
   resolver plugin from [`tools/repo-config/vitest.base.mjs`](../../../../tools/repo-config/vitest.base.mjs).

## Article 6 substrate ledger

- **Architect** authored: this retro, [`docs/meta/ops/vitest-parallel-adoption.md`](../../../meta/ops/vitest-parallel-adoption.md), [`tools/repo-config/vitest.base.mjs`](../../../../tools/repo-config/vitest.base.mjs), [`tools/stryker/base.mjs`](../../../../tools/stryker/base.mjs).
- **Engineer** authored: per-package `vitest.config.ts` / `vitest.int.config.ts` / `vitest.stryker.config.ts` (33 + 14 + 11 files), per-package script + dep updates (35 `package.json` files), `turbo.json` task list, `.github/dependabot.yml` groups.
- **Inspector** authored: spec codemods, the four spec source changes (`vi.hoisted` wraps + `require → import`), `@stynx-nyx/auth/test/unit/validators.spec.ts:411` runner-detection bridge → simplified to `vi.importActual` post-cutover.
- **Auditor** authored: nothing in this phase — V5 audit reports preceded cutover; next audit comes after the V7 cleanup.
- **F4/F5** untouched.
