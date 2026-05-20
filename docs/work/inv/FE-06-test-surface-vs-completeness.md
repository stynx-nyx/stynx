# FE-06 — Test Surface vs Completeness Claims

**Compiled:** 2026-05-19
**Reads:** `coverage/test-evidence.json` (2026-05-19T03:41:15Z), `packages-web/*/test/`, `reference/web/test/e2e/`.
**Why a dedicated file.** `inv/03-frontend.md` already counts the tests. This file asks a different question: **for each completeness claim in [FE-01](FE-01-expectations-matrix.md), does the test surface actually exercise it?**

## Method

Treat each row of the [FE-01](FE-01-expectations-matrix.md) matrix as a claim. For each claim, identify which test files (unit, integration, Playwright) exercise it, and how deeply. Mark:

- 🟢 **Verified** — a test asserts the user-visible behaviour required for the claim.
- 🟡 **Surface** — a test asserts the API surface (export-existence, DI shape, route table shape) but not the user-visible behaviour.
- 🔴 **Unverified** — no test exists for the claim.

## Per-claim mapping

| Claim (FE-01 row)                                      | Best-evidence test(s)                                                                                                                      | Depth |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | :---: |
| 1. Auth — Login / refresh / logout                      | `packages-web/angular-auth/test/*.spec.ts` (12 tests); `reference/web/test/e2e/reference-web.spec.ts` (login step of CRUD flow).             | 🟢   |
| 2. Profile — view / edit / prefs / MFA                  | `packages-web/angular-profile/test/angular-profile.spec.ts` — 2 `Component.toBeDefined()` tests.                                            | 🔴   |
| 3. Sessions — list / revoke                             | `packages-web/angular-sessions/test/angular-sessions.spec.ts` — 1 `Component.toBeDefined()` test.                                           | 🔴   |
| 4. Users admin                                          | —                                                                                                                                            | 🔴   |
| 5. Roles admin                                          | —                                                                                                                                            | 🔴   |
| 6. Groups admin                                         | —                                                                                                                                            | 🔴   |
| 7. Permission check (`*stynxHasPermission`)             | Inside `angular-auth.spec.ts` — guard logic + directive shape.                                                                              | 🟡   |
| 8. Permissions admin UI                                 | —                                                                                                                                            | 🔴   |
| 9. i18n runtime catalog                                 | `packages-web/angular-i18n/test/angular-i18n.spec.ts` (3 tests) — service, pipe, switcher DI presence.                                       | 🟡   |
| 10. Translation files                                   | —                                                                                                                                            | 🔴   |
| 11. ICU / pluralisation / dates                         | —                                                                                                                                            | 🔴   |
| 12. Storage upload                                      | `packages-web/angular-storage/test/*` (6 tests) — mime + size validation + service shape; no XHR-progress / abort / timeout.                | 🟡   |
| 13. Storage download                                    | —                                                                                                                                            | 🔴   |
| 14. Trash / restore                                     | `packages-web/angular-trash/test/angular-trash.spec.ts` (2 tests) — shape only.                                                              | 🔴   |
| 15. Tenancy context + interceptor                       | `packages-web/angular-tenancy/test/*.spec.ts` (10 tests) — provider matrix + DI + interceptor behaviour.                                     | 🟢   |
| 16. Tenancy switcher                                    | Inside `angular-tenancy.spec.ts` — switcher DI presence.                                                                                    | 🟡   |
| 17. Audit log viewer                                    | —                                                                                                                                            | 🔴   |
| 18. Per-entity history                                  | —                                                                                                                                            | 🔴   |
| 19. Workflow UI — designer                              | `packages-web/angular-flow/test/flow-graph-designer.component.spec.ts` (1 test) — renders shell with stubbed data.                          | 🟡   |
| 20. Workflow UI — canvas                                | `packages-web/angular-flow/test/flow-graph-canvas.component.spec.ts` (1 test).                                                              | 🟡   |
| 21. Workflow UI — forms / fills / waivers / tasks       | `packages-web/angular-flow/test/flow-api.service.spec.ts` — HTTP layer; component-side fills / waivers untested.                            | 🟡   |
| 22. Workflow UI — analytics                             | —                                                                                                                                            | 🔴   |
| 23. Workflow UI — installable                           | `packages-web/angular-flow/test/routes-and-exports.spec.ts` — route shape.                                                                  | 🟡   |
| 24. UI primitives                                       | `packages-web/angular-ui/test/*` (7 tests) — jsdom renders, no a11y / responsive / theme.                                                   | 🟡   |
| 25. Modern Angular standards                            | Implicit; no test asserts `OnPush` is used or that no `NgModule` is required.                                                                | 🔴   |
| 26. Library packaging                                   | —                                                                                                                                            | 🔴   |
| 27. Consuming reference app                             | `reference/web/test/e2e/` (4 scenarios).                                                                                                    | 🟢 (narrow) |
| 28. Documentation                                       | —                                                                                                                                            | 🔴   |

## Counts

- 🟢 Verified: **3 claims** (Auth, Tenancy context, narrow reference-app E2E).
- 🟡 Surface: **9 claims** (existence / shape only).
- 🔴 Unverified: **16 claims** (more than half the matrix).

## What the Playwright suite covers

Per `reference/web/test/e2e/`:

| Spec                       | Scenario                                                                              | Maps to claim(s)             |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| `reference-web.spec.ts`    | login → create record → create work-item → soft-delete → restore → logout              | 1, 12 (incidental), 14 (incidental), 27 |
| `record-trash.spec.ts`     | record soft-delete appears in trash → restore                                          | 14 (narrow)                  |
| `flow-access.spec.ts`      | flow routes redirect unauth'd; admin mounts forms / fills / assignments / waivers / open-tasks / summary | 23 (route gate only)         |

**Not covered by Playwright:** profile, sessions, users-admin, roles-admin, groups-admin, permission-matrix UI, i18n locale switching, storage upload (real file), download, trash bulk operations, audit-log viewer, per-entity history, flow design end-to-end, flow runtime fill, tenant switching, permission-denied banner, dev-OIDC failure path, expired-session redirect, multi-tab session-revoke propagation.

## Test-shape problems specific to the FE completeness claim

(Already noted in `diag/06-frontend-quality.md` but here re-anchored against the completeness matrix.)

1. **Specs construct components via `Injector.create()` rather than `TestBed`.** This works for tokens / guards / DI; it does not render templates. For components like `StynxFlowGraphDesignerComponent` or `StynxDocumentUploadComponent`, the template is the contract. Without a real fixture, input / output / DOM behaviour is unverified.

2. **One `*.e2e-spec.ts` per package — all of them are `Component.toBeDefined()` smokes.** Per `inv/03-frontend.md`, every `packages-web/*/test/e2e/*.e2e-spec.ts` is a single export-existence assertion. None of them is a real E2E.

3. **No router exercise.** `flowRoutes()` shape is asserted; no test mounts the router under `provideRouter([...flowRoutes()])`, navigates, and asserts the right component activated under the right guard.

4. **No XHR / HTTP error paths.** `XhrUploadExecutor` is happy-path only; no abort, no network failure, no 5xx, no `progress` event sequence assertion.

5. **No tenant-aware behaviour across packages.** No spec exercises "tenant changes → flow list refetches → trash list refetches".

6. **No i18n in-place.** No spec asserts that any shipped component's template renders the translated string after `provideStynxI18n({ catalog: ... })`.

## Verdict

The current test surface is **a thin sanity check, not a regression net** for the completeness claims. Where claims are missing entirely (rows 4–6, 8, 17, 18, 22), no tests can exist; where claims are stubbed (rows 2, 3, 14), the 100 % coverage misleads because the stub body is empty.

A real fan-out per claim — TestBed component tests, real router tests, real XHR tests, Playwright scenarios that touch every UI vertical — is what closes this gap. See [plan/FE-WAVE-G](../plan/FE-WAVE-G-test-fan-out.md).
