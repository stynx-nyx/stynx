# FE-WAVE-G — Test Fan-Out: TestBed, Playwright Per Vertical, A11y, Mutation Rebase

**Wave goal.** Replace the "looks-green-isn't-exercised" test surface with one that verifies every FE-01 completeness claim. TestBed-rendered component specs everywhere; per-vertical Playwright scenarios; `@axe-core/playwright` non-blocking accessibility report; mutation verified against repository thresholds.

## Scope

| Surface                                  | Action                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Unit / component tests in `packages-web/*` | Migrate to `TestBed` everywhere; one `expect(Component).toBeDefined()` per package, no more.            |
| Router tests in `packages-web/*`         | Add `routing/<pkg>-routes.spec.ts` per package that ships routes (`angular-flow`, `angular-iam`, `angular-audit`, `angular-profile`). |
| Playwright fan-out                        | One spec per FE-01 row; see [../diag/FE-05](../diag/FE-05-testing-against-expectations.md) for the file layout. |
| Real-OIDC mode for Playwright             | Opt-in `PLAYWRIGHT_USE_REAL_OIDC=1` boots `reference-api` + `oidc-fake-server`; otherwise dev-auth.     |
| Accessibility                            | `@axe-core/playwright` per spec; non-blocking report under `.test-results/a11y.json`.                   |
| Mutation                                 | Re-run Stryker for every package against the thresholds configured in the repository policy/package Stryker config. |
| Per-package `test/e2e/` smokes           | Delete (per [../diag/FE-04](../diag/FE-04-stale-unused-flaky.md#1-per-package-e2e-spects-smokes-are-misleading)). |
| `test/support/test-bed.ts`               | Author the shared `renderComponent<T>(...)` factory per package.                                        |

## Workstreams

### G.1 — `test/support/test-bed.ts` per package

For each `packages-web/<pkg>/test/support/test-bed.ts`:

```ts
export async function renderComponent<T>(
  Component: Type<T>,
  options: { inputs?: Partial<T>; providers?: Provider[] } = {},
): Promise<ComponentFixture<T>> {
  await TestBed.configureTestingModule({
    providers: [
      provideStynxAngular({ ... }),
      provideStynxAuth(stubAuth),
      provideStynxTenancy(stubTenancy),
      provideStynxI18n(stubI18n),
      ...(options.providers ?? []),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Component);
  if (options.inputs) Object.assign(fixture.componentInstance, options.inputs);
  fixture.detectChanges();
  return fixture;
}
```

`stubAuth`, `stubTenancy`, `stubI18n` live in `test/support/stubs.ts`.

### G.2 — Migrate one component spec per package as exemplar

For each package that ships components:
- Author one spec that uses `renderComponent` and asserts a real DOM behaviour (input → output → DOM).
- Use this as the template for the rest.
- Coding convention: one component → one spec file.

### G.3 — Authoring the per-component specs

For each shipped component in each package: ship a TestBed spec that exercises:
- Render with default inputs.
- Render with edge-case inputs (empty list, error state).
- Output emission on user interaction.
- Form validation states (where applicable).
- Translated-strings render under a stubbed catalog.

Branch coverage target: ≥ 80 %. Mutation: per the configured repository threshold.

### G.4 — Router specs

Per package that ships routes:
- `routing/<pkg>-routes.spec.ts` — `provideRouter([...routes])`, navigate each path, assert activated component, assert guards behave under stubbed permission sets.

### G.5 — XHR / HTTP error matrix

Specs that exercise:
- `XhrUploadExecutor` / `MultipartUploadExecutor`: abort, timeout, 5xx, progress sequence.
- `@stynx-web/sdk` transport: 401-with-refresh, 429-with-retry-after, 503 fallback, network error, abort.

### G.6 — Playwright fan-out

`reference/web/test/e2e/flows/` per [../diag/FE-05](../diag/FE-05-testing-against-expectations.md#test-layout-proposal):
- `auth.spec.ts`
- `profile.spec.ts`
- `sessions.spec.ts`
- `iam-users.spec.ts`
- `iam-roles.spec.ts`
- `iam-groups.spec.ts`
- `permissions.spec.ts`
- `i18n.spec.ts`
- `storage.spec.ts`
- `trash.spec.ts`
- `tenancy.spec.ts`
- `audit.spec.ts`
- `flow-design.spec.ts`
- `flow-runtime.spec.ts`
- `flow-analytics.spec.ts`

Each spec ≤ 5 minutes wall-time. Shared fixtures in `reference/web/test/e2e/fixtures.ts`.

### G.7 — Real-OIDC opt-in

`reference/web/playwright.config.mjs`:
- Read `PLAYWRIGHT_USE_REAL_OIDC` env.
- If set, boot `reference-api` + `oidc-fake-server` as `webServer` entries; otherwise keep the static-SPA bypass.
- The login spec branches on the env to drive either the dev-auth form or the real OIDC code flow.

### G.8 — Accessibility

`@axe-core/playwright` per spec. Output to `.test-results/a11y.json`. Initially non-blocking; gate after a stabilisation window (per the gate-ratchet in [../diag/FE-05](../diag/FE-05-testing-against-expectations.md#gate-ratchet)).

### G.9 — Mutation threshold verification

Run Stryker for every `packages-web/*` package. Confirm each package passes its configured repository threshold (`scripts/test-matrix.config.json` plus package Stryker config). Investigate survivors; either kill via new tests or document the survivor. Do not invent higher wave-local bars unless an Architect updates the repo policy.

### G.10 — Delete per-package `*.e2e-spec.ts` smokes

Delete every `packages-web/*/test/e2e/*.e2e-spec.ts`. They are export-existence smokes (already noted in the testing-pipeline `W7` cleanup). Re-introduce as `packages-web/<pkg>/test/unit/consumer-smoke.spec.ts` if any genuinely useful as a single export check.

## Success criteria

1. Every shipped component has a TestBed-rendered spec.
2. Every package shipping routes has a router spec.
3. The Playwright fan-out covers every FE-01 row whose claim is now shipped.
4. `PLAYWRIGHT_USE_REAL_OIDC=1` boots `reference-api` and the suite passes.
5. `@axe-core/playwright` runs per spec; report under `.test-results/a11y.json`.
6. Mutation passes the configured repository thresholds; Stryker records artifacts for all packages.
7. Per-package `*.e2e-spec.ts` smokes are deleted.
8. `coverage/test-evidence.json` reflects the new surface; the matrix view shows real depth, not just 100 % from stubs.

## Closure artifact

`docs/work/plan/FE-WAVE-G-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| G.1 support helpers | Inspector |
| G.2–G.5 unit / component / router / HTTP specs | Inspector |
| G.6 Playwright fan-out | Inspector |
| G.7 Playwright config | Engineer (config under `reference/web/`) + Inspector (specs) |
| G.8 a11y | Inspector |
| G.9 mutation rebase | Inspector |
| G.10 deletion | Inspector |
| Test-matrix policy bump | Architect |
