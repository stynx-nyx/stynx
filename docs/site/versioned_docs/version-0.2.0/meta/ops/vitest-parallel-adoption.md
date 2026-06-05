# Vitest parallel adoption — current state

&gt; **Status:** V0 ✅ · V1 ✅ · V2 ✅ · V3 ✅ · V4 ✅ · V5 gate green — hardening window can begin · V6 partially landed · V7 pending
&gt; **Authority:** Engineer (configs, scripts), Architect (this doc).
&gt; **Last updated:** 2026-05-18

Parallel-adoption initiative: stand up Vitest alongside Jest across stynx, prove parity on a per-package basis, then cut over (V6) once the parity gate has been green for the V5 hardening window.

The full phased plan (V0–V7) lives in the conversation that produced this; this doc is the operational reference for what exists today.

## Parity headline

**🎯 Full PARITY achieved.** All 48 in-scope packages — every unit and integration lane — have matching Jest and Vitest pass/fail per file.

| Lane                                                                                    | Parity | Total  | %        |
| --------------------------------------------------------------------------------------- | ------ | ------ | -------- |
| V0 + V1 unit (`packages/*` + `packages-web/sdk`)                                        | **19** | 19     | **100%** |
| V2 integration (`packages/*/test/integration`)                                          | **14** | 14     | **100%** |
| V3 Angular (`packages-web/angular*`)                                                    | **10** | 10     | **100%** |
| V4 auxiliary (`infra/cdk`, `reference/api`, `domain/*/api`, `test/db`, `test/packages`) | **5**  | 5      | **100%** |
| **Combined**                                                                            | **48** | **48** | **100%** |

The parity gate (`pnpm test:parity` + `pnpm test:parity:int`, wired into `ci:stynx`) is now green. **V5 hardening window can begin.**

Artifacts: `coverage/parity.json` (unit), `coverage/parity-int.json` (integration).

## Infrastructure delivered

### Shared

- `tools/repo-config/vitest.base.mjs` — config factory. Exports `createVitestConfig(...)` with options for include, aliases, coverage thresholds, single-thread, `passWithNoTests`, and `patchDrizzle`. Bundles four Vite plugins (see below).
- `tools/repo-config/vitest.setup.compat.ts` — runtime compat shim: `globalThis.jest = vi` aliasing for runtime calls not caught by the syntactic rewrite.
- `tools/repo-config/drizzle-entity-shim.mjs` — drop-in replacement for `drizzle-orm/entity` whose `is()` short-circuits on null-prototype namespace objects.
- `scripts/test-parity.mjs` — name-tolerant per-file Jest↔Vitest diff. Run as `pnpm test:parity` / `pnpm test:parity:int`.
- `scripts/setup-vitest-scripts.mjs` — idempotent generator for per-package `test:vt` / `test:int:vt` script entries.

### Plugins inside `vitest.base.mjs`

1. **`stynx:workspace-fallback-resolve`** (`enforce: 'post'`) — if the default resolver fails on a bare import, falls back to the workspace root's `node_modules/.pnpm/node_modules`. Required because transitive devDeps like `@nestjs/testing` aren't always symlinked into the importing package, and Vitest's resolver is stricter than Jest's.
2. **`stynx:jest-to-vi-rewrite`** (`enforce: 'pre'`) — syntactic rewrite of `jest.mock` / `jest.fn` / `jest.spyOn` / `jest.useFakeTimers` / `jest.clearAllMocks` / `jest.resetModules` etc. to `vi.*` equivalents, so Vitest's mock hoister catches them and the calls don't depend on the compat shim being loaded yet. Also detects `jest.mock(spec, () =&gt; &#123; ... jest.requireActual(spec2) ... &#125;)` patterns and rewrites the factory to async with `await vi.importActual`. **`jest.restoreAllMocks` and `jest.isolateModules` are deliberately _not_ rewritten** — `vi.restoreAllMocks` wipes factory mock implementations (Jest preserves them) and `vi.isolateModules` doesn't exist in Vitest 3; routing them through the shim gives Jest-compatible behaviour.
3. **`stynx:drizzle-is-patch`** (`enforce: 'post'`) — transforms drizzle's compiled `entity.cjs` to short-circuit on null prototypes. Combined with the alias shim, gives belt-and-braces coverage.
4. **`unplugin-swc`** — TypeScript transform with `emitDecoratorMetadata: true`. Required for any NestJS DI test to instantiate providers.

### Test deps

- Inlined: `/@nestjs/`, `/@aws-sdk/`, `/@stynx\//`, `/@stynx-web\//` (so `vi.mock` can intercept their exports and so `require()` and `import` resolve to the same module instance).
- Aliased per-package: `drizzle-orm/entity` → shim (only when `patchDrizzle: true` is passed).

### Jest-side polyfill (`tools/repo-config/jest.setup.vi-shim.cjs`)

Used as `setupFiles` in `packages/&#123;auth,core,sessions,testing&#125;/jest.config.cjs`. Defines a minimal `globalThis.vi` (`vi.hoisted = fn =&gt; fn()`, `vi.fn = jest.fn`, `vi.importActual = jest.requireActual`, etc.) so specs can use Vitest-native APIs (e.g. `vi.hoisted(...)`) while still passing Jest. Removed at V6 cutover.

### Per-package files (48 configs, 48 scripts)

- 19 `vitest.config.ts` files (V0 + V1): 18 in `packages/*` + 1 in `packages-web/sdk`.
- 14 `vitest.int.config.ts` files (V2): every `packages/*` that has `jest.integration.config.cjs`.
- 10 `vitest.config.ts` files (V3): every `packages-web/angular*`. Each uses `environment: 'jsdom'` and aliases `rxjs` → its package-local CJS variant (matching the Jest config).
- 5 `vitest.config.ts` files (V4): `infra/cdk`, `reference/api`, `domain/demo-bookmark/api`, `test/db`, `test/packages`. (`test/frontend` deferred — depends on a vestigial `frontend/` directory.)
- 48 `test:vt` / `test:int:vt` script entries in package.json files, generated by `scripts/setup-vitest-scripts.mjs`.

### Pipeline

- `turbo.json` — `test:vt`, `test:int:vt` tasks (parallel to `test`, `test:int`).
- `package.json` — root scripts: `test:vt`, `test:int:vt`, `test:parity`, `test:parity:int`.

### Workspace dependencies (root devDependencies)

- `vitest@^3`
- `@vitest/coverage-v8@^3`
- `unplugin-swc`
- `@swc/core`

## Source changes outside `tools/`

| File                                                                 | Change                                                                                                                 | Why                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/data/src/schema/index.ts`                                  | Removed 6 dead `export * as &lt;ns&gt; from './x'` re-exports                                                          | Produced Module-namespace objects with null prototypes which crashed drizzle's `is()`. No callers in the repo.                                                                      |
| `packages/core/test/unit/config-ssm.spec.ts`                         | Wrapped top-level `mockX` declarations in `vi.hoisted(...)`                                                            | Top-level mock vars referenced inside `vi.mock` factories hit TDZ under Vitest. `vi.hoisted` is the canonical fix; Jest sees it via the polyfill.                                   |
| `packages/sessions/test/unit/redis-session-store.spec.ts`            | Same pattern                                                                                                           | Same                                                                                                                                                                                |
| `packages/testing/test/create-test-app.unit.spec.ts`                 | Wrapped all top-level mocks + `class FakeContainer` in a single `vi.hoisted(...)` block                                | Same                                                                                                                                                                                |
| `packages/auth/test/unit/validators.spec.ts`                         | Standalone `jest.requireActual` switched to a runner-detecting `vi.importActual` / `jest.requireActual` bridge         | Vitest needs `await vi.importActual` (sync `vi.importActual` doesn't exist); Jest needs sync `jest.requireActual` with spec-relative resolution.                                    |
| `packages/data/test/unit/migration-runner.spec.ts`                   | `jest.doMock(...)` + `require(...)` pattern rewritten to `jest.doMock(...)` + `await import(...)`                      | Vitest's hoister and module graph need a dynamic import after `vi.doMock`. Jest accepts the dynamic import because the parity script sets `NODE_OPTIONS=--experimental-vm-modules`. |
| `domain/demo-bookmark/api/test/bookmark*.service.spec.ts`            | `require('@stynx/core').RequestContext` → static `import &#123; RequestContext &#125; from '@stynx/core'`              | The `require` produced a different class identity than NestJS DI registered (CJS-vs-ESM dual evaluation).                                                                           |
| `reference/api/test/integration/reference-api.unit-coverage.spec.ts` | `jest.isolateModules(() =&gt; &#123; require(...) &#125;)` → `jest.resetModules(); await import(...)` in an async test | `vi.isolateModules` doesn't exist in Vitest 3 and `require()` inside the callback bypassed Vite's module graph.                                                                     |

Jest configs gained one `setupFiles` entry each (`packages/&#123;auth,core,sessions,testing&#125;/jest.config.cjs`) to load the `vi` polyfill.

## Remaining divergences

None. All previously open divergences landed in the V5-readiness pass:

- `packages/auth/test/unit/validators.spec.ts` — standalone `jest.requireActual` switched to a runner-detecting `vi.importActual` bridge (Vitest async path; Jest sync fallback via the global).
- `packages/data/test/unit/migration-runner.spec.ts` — `jest.doMock(...)` + `require(...)` pattern rewritten to `jest.doMock(...)` + `await import(...)` (works under both runners because the parity script invokes Jest with `NODE_OPTIONS=--experimental-vm-modules`).
- `packages/i18n/test/integration/i18n.module.spec.ts` — collected by the unit-lane config (because `test/**/*.spec.ts` matches both unit and integration). The integration spec needed `@stynx/sessions` + `@stynx/testing` aliases in the unit `vitest.config.ts` to avoid pulling those packages through their compiled CJS `dist/`, which produced a duplicate `RequestContext` class identity and broke NestJS DI.
- `domain/demo-bookmark/api/test/bookmark*.service.spec.ts` — `require('@stynx/core').RequestContext` rewritten to a static `import &#123; RequestContext &#125; from '@stynx/core'`.
- `reference/api/test/integration/reference-api.unit-coverage.spec.ts` — `jest.isolateModules(() =&gt; &#123; require(...) &#125;)` rewritten to `jest.resetModules(); await import(...)` inside an async test body.
- `vi.dontMock` was removed from the syntactic rewrite list and aliased to `vi.unmock` inside the compat shim (Vitest has no `vi.dontMock`).

## How to use

```bash
# Run Vitest across the in-scope unit packages (matches `pnpm test` shape):
pnpm test:vt

# Run Vitest integration lane:
pnpm test:int:vt

# Verify parity Jest↔Vitest (writes coverage/parity*.json):
pnpm test:parity
pnpm test:parity:int

# Per-package (passes through Turbo + script):
pnpm --filter @stynx/data test:vt
pnpm --filter @stynx/data test:int:vt
```

The parity script's diff is name-tolerant: it compares per-file pass/fail counts rather than fully-qualified test names, absorbing `it.each` title-encoding differences between the two runners.

## V5 — parity gate

`pnpm ci:stynx` now runs `pnpm test:parity` and `pnpm test:parity:int` between `pnpm test:int` and `pnpm build`. The parity script exits `0` on full PARITY and `1` on any divergence. As of 2026-05-18 the gate is **green** — the hardening window can begin. The recommended cadence is two weeks of green main builds before V6 cutover.

## V3 (Angular lane) — completed without @analogjs/vitest-angular

Survey discovery: **no Angular package in stynx uses `TestBed`** — every Angular spec is a pure-logic test of services, interceptors, or pipes with hand-rolled fakes. That eliminated the canonical reason to bring `@analogjs/vitest-angular` into the picture.

V3 reused the existing `createVitestConfig` factory with two adjustments per package:

- `environment: 'jsdom'` (instead of `'node'`).
- `rxjs` aliased to the package-local CJS variant (`&lt;pkg&gt;/node_modules/rxjs/dist/cjs/index.js`), matching the existing Jest `moduleNameMapper`.

One change to the parity script: jest invocations now pass `NODE_OPTIONS=--experimental-vm-modules --disable-warning=ExperimentalWarning`, because `jest-preset-angular`'s ESM preset requires VM modules. This matches what the Angular packages' `test` scripts already do.

Result: all 10 Angular packages at PARITY on the first full sweep.

&gt; If a future Angular package introduces `TestBed`-based component tests, that single package can opt into `@analogjs/vitest-angular` via a config override — the rest stay on the lightweight path.

## Next steps

- **V5 hardening window** — `ci:stynx` now runs `pnpm test:parity` + `pnpm test:parity:int`. With 4/48 packages still divergent (1 codemod pattern remaining), the gate currently fails. Two paths: (a) complete the 3-spec codemod and start the window today, (b) temporarily set the parity script's exit code to `0` while leaving the diff visible, and ratchet down divergences over the window.
- **V6 cutover** — switch `@stryker-mutator/jest-runner` → `@stryker-mutator/vitest-runner`, renegotiate mutation thresholds, flip `pnpm test` to call Vitest, remove Jest configs + the `jest.setup.vi-shim.cjs` polyfill + the `tools/repo-config/vitest.setup.compat.ts` shim.
- **V7 cleanup** — drop jest deps, update `CLAUDE.md` / `AGENTS.md` references, update `lint:deps` ignore list, restore the original strict coverage thresholds in `tools/repo-config/jest.coverage.cjs`.

## Open risks

1. **drizzle null-prototype patch** is a runtime workaround, not a source fix. It would survive a drizzle upgrade but should be re-verified.
2. **V3's TestBed-free assumption** — Angular packages today run pure-logic tests with no component compilation. If a future spec introduces `TestBed.configureTestingModule(...)` for a real component, the SWC transform alone won't compile Angular templates. That spec (and only that spec's package) would need `@analogjs/vitest-angular`.
3. **Stryker** is still on `jest-runner` and will stay there through V5. Mutation scores may shift at V6 cutover; re-baseline under Inspector authority.
4. **Coverage thresholds** were temporarily zeroed on non-strict packages to absorb v8-vs-istanbul deltas during the parallel window — restore to the original `tools/repo-config/jest.coverage.cjs` values at V6.
