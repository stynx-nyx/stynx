# PORM Flow Deprecation Readiness

**Authority:** Architect and Inspector, per DEVAI Constitution Article 6.
**Last updated:** 2026-05-18.
**Scope:** `@stynx/flow`, `@stynx-web/angular-flow`, and reference app proof needed before replacing `../porm` local Flow.

This note is the consuming-repo cutover plan for `../porm`. It does not authorize the sibling repo migration by itself; execute that work only when explicitly requested.

## Readiness Snapshot

| Area                | STYNX status                                                                                                                                                             | Deprecation decision                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Database runtime    | Ready. Flow design/runtime tables, RLS, soft-delete, DML audit, mutation signals, form gates, task functions, and analytics queries live in platform migrations.         | PORM DB Flow should be replaced by STYNX migrations plus a data migration for existing tenant graph/form/runtime rows.                |
| Backend API         | Ready for framework use. The reference API mounts `StynxFlowModule` behind auth, permission, request-context, idempotency, rate-limit, and audit pipeline.               | PORM controllers should become thin package consumers or be removed after route compatibility is verified.                            |
| Angular package     | Ready as a generic package. It provides route helpers, API facade, typed fill controls, task/fill/form/waiver/analytics components, and route-level reference E2E smoke. | PORM product screens can consume the package directly for generic flows and wrap/replace visual editor surfaces as needed.            |
| Visual graph editor | Deliberately generic. The package keeps a dependency-light list/canvas fallback rather than bundling Cytoscape-grade editing.                                            | Rich PORM-style visual authoring remains a host extension point until multiple consumers require the same editor.                     |
| Host store          | Not added. Current package screens use local loading/error state and do not share enough selection/refresh orchestration to justify a package-owned store.               | Add a store only if package-owned screens start coordinating graph, form, task, selection, refresh, and mutation state across routes. |
| PORM cutover        | Planned, not executed.                                                                                                                                                   | Keep PORM local Flow until the migration below is run against the sibling repo.                                                       |

## Evidence Added By Wave 09

- `reference/api/test/integration/reference-api.runtime.spec.ts` now exercises Flow through the full Nest HTTP stack:
  - unauthenticated and missing-permission guard behavior;
  - design creation with request-context actor columns;
  - idempotent run and fill creation with replay headers;
  - audit rows for scope, run, fill, answer, waiver, signal, task assignment, and task action mutations;
  - task candidates, assignment, accept, action completion, signal freshness, open-task analytics, and run summary analytics.
- `reference/web/test/e2e/flow-access.spec.ts` now covers generic package routes for forms, fills, assignments, waivers, open tasks, and run summary.

## PORM Cutover Plan

1. Inventory PORM Flow usage:
   - list local backend imports under `../porm/backend/src/**/flow/**`;
   - list frontend imports/routes under `../porm/frontend/src/**/flow/**`;
   - list direct SQL references to `flow.*` tables/functions.
2. Align package versions:
   - add `@stynx/flow` to the PORM backend workspace;
   - add `@stynx-web/angular-flow` to the PORM frontend workspace;
   - align peer versions for Nest, Angular, STYNX auth/data/core, and SDK packages.
3. Database migration:
   - apply STYNX platform Flow migrations into the PORM target database;
   - map existing PORM scopes, graphs, nodes, edges, forms, questions, fills, answers, waivers, runs, tasks, and events into STYNX table shapes;
   - prove RLS, DML audit triggers, answer/waiver signal triggers, and event append-only protections after migration.
4. Backend route migration:
   - mount `StynxFlowModule` in the PORM API module after auth, data, tenancy, idempotency, audit, and pipeline modules;
   - remove or redirect local Flow controllers one route family at a time;
   - keep only host-domain adapters, resolver functions, policy seeds, and product-specific facades in PORM.
5. Frontend route migration:
   - provide the PORM SDK client through `provideStynxFlow(...)`;
   - mount `flowRoutes()` for generic Flow surfaces;
   - wrap package components where PORM needs product labels or richer graph editing;
   - do not port Cytoscape-specific editor behavior into the package unless it becomes cross-consumer framework behavior.
6. Test migration:
   - port PORM backend Flow task/form/signal/analytics E2E tests to package/reference surfaces first;
   - then run the equivalent PORM consumer tests against the package-backed routes;
   - keep frontend smoke focused on route access and generic component behavior unless the host retains a richer custom editor.
7. Removal:
   - delete PORM local Flow code only after package-backed tests are green;
   - keep a data rollback plan for one release window if the production migration has already run;
   - update PORM docs to mark local Flow as deprecated by `@stynx/flow` and `@stynx-web/angular-flow`.

## Deferrals That Do Not Block Deprecation

- Full Cytoscape-equivalent graph editing is not required for STYNX package maturity.
- A package-owned Angular host store is not required until shared route orchestration becomes materially duplicated.
- Absolute PORM API parity is not the bar; route additions should be driven by package UX, reference app proof, or real consumer migration needs.
