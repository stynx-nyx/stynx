# PORM Flow To STYNX Reassessment

**Date:** 2026-05-17
**Discipline:** Auditor report under DEVAI Article 6
**Scope:** Flow only. CMS remains out of scope.
**Source evidence:** `../porm/backend/src/flow/`, `../porm/frontend/src/app/flow/`, `../porm/tests/backend/api/flow/`, `../porm/tests/backend/unit/flow-*.test.ts`, `../porm/tests/backend/e2e/flow-*.e2e-spec.ts`, `../porm/tests/frontend/e2e/flow/`.

## Executive Assessment

Flow is partially transposed, but not closure-ready.

The backend and database layer now have a real generic STYNX implementation with RLS, append-only workflow events, package-level route metadata tests, validation tests, and a live PostgreSQL integration test. A fresh disposable database can apply all 15 platform migrations through `0014_flow.sql` and pass `pnpm db:verify`.

The Angular package exists and builds, but it is still a host-mountable shell rather than PORM Flow feature parity. It has no package tests, and `passWithNoTests` currently hides that gap. The remaining backend gaps are mostly runtime semantics and API coverage rather than basic build viability.

Recommendation: **not ready** for final Flow closure. Continue with an Inspector/Engineer follow-up set before running `PORM-FLOW-09`.

## Prompt Sequence Status

| Prompt | Status | Evidence |
|---|---:|---|
| `PORM-FLOW-01` architecture/contracts | Done with caveats | `docs/architecture/flow.md`, `docs/contracts/flow-api.md`, invariants and trace exist. Trace still references an Angular test path that does not exist. |
| `PORM-FLOW-02` data model | Implemented | `packages/data/migrations/platform/0014_flow.sql`, `packages/data/src/schema/flow.ts`. Fresh DB migration and `db:verify` pass. |
| `PORM-FLOW-03` backend design API | Implemented | `packages/flow/src/controllers/**`, design services, package manifest. |
| `PORM-FLOW-04` runtime/tasks/events/adapters | Implemented with high-risk deferrals | Runtime functions and services exist; effect execution, resolver function expansion, and some task privilege semantics remain incomplete. |
| `PORM-FLOW-05` forms/fills/waivers/policy/analytics | Implemented with coverage gaps | CRUD surfaces exist; missing aliases/bulk-answer API, policy evaluation tests, analytics paging/filter parity. |
| `PORM-FLOW-06` backend tests | Implemented | `@stynx/flow` unit and DB integration tests pass. |
| `PORM-FLOW-07` Angular package | Implemented as shell | `@stynx-web/angular-flow` typecheck/lint/build pass. UI/API parity incomplete. |
| `PORM-FLOW-08` Angular tests | Not done | No `packages-web/angular-flow/test/` directory. Test command passes only because `passWithNoTests: true`. |
| `PORM-FLOW-09` final closure | Not done | Should wait for the blocker/high gaps below. |

## Gate Evidence

| Command | Result | Notes |
|---|---:|---|
| `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int` | Fail | One stale assertion expects `core.schema_migrations` count `'13'`; live count is `'15'`. This is a test-maintenance failure after adding platform migrations. |
| `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int` | Pass | 1 suite, 3 tests. Exercises RLS, archive mirrors, event append-only behavior, task lifecycle, form facts. |
| `pnpm --filter @stynx/flow test` | Pass | 2 suites, 7 tests. |
| `pnpm --filter @stynx/flow typecheck` | Pass | Package compiles with no emit. |
| `pnpm --filter @stynx/flow lint` | Pass | Nest lint clean. |
| `pnpm --filter @stynx/flow build` | Pass | TypeScript build succeeds. |
| `pnpm --filter @stynx-web/angular-flow test` | Pass but weak | No tests found; exits 0 due `passWithNoTests`. Treat as missing coverage, not a meaningful pass. |
| `pnpm --filter @stynx-web/angular-flow typecheck` | Pass | Spec tsconfig typecheck succeeds. |
| `pnpm --filter @stynx-web/angular-flow lint` | Pass | Angular lint clean. |
| `pnpm --filter @stynx-web/angular-flow build` | Pass | TypeScript build succeeds. |
| `pnpm lint:migrations` | Pass | Clean, 15 migration files. |
| `pnpm lint:deps` | Pass | No depcheck issue. |
| `pnpm lint:cycles` | Pass | No circular dependencies across 466 files. |
| `pnpm doctor` | Pass | No output. |
| Fresh DB `migrate up` against `postgresql://${USER}@localhost:5432/stynx_flow_recheck` | Pass | Applies migrations `0001` through `0014_flow.sql`. |
| `DATABASE_URL=postgresql://${USER}@localhost:5432/stynx_flow_recheck pnpm db:verify` | Pass | `[db:verify] passed`. |
| Forbidden coupling grep over Flow code/migration/schema | Pass | No `cms.content`, PORM opportunity/proposal/engagement, legacy guards, or legacy database service references found. |
| `git diff --check` | Pass | No whitespace errors. |

## Current Strengths

- Database layer now has tenant-scoped Flow tables with forced RLS, soft-delete/archive mirrors where appropriate, and append-only `flow.events`.
- Runtime can create runs, open nodes, create tasks from agent rules, accept/decline/assign/unassign/act, append events, transition nodes, complete runs, and rebuild form facts.
- Backend package uses STYNX package dependencies instead of PORM backend services.
- Route metadata tests verify private, permissioned, audited, readonly, and idempotent route classes for key surfaces.
- Generic Flow source is free of CMS/PORM domain coupling.
- Angular package follows STYNX web package naming and builds as `@stynx-web/angular-flow`.

## Blockers

| Area | Gap | Required owner | Required action |
|---|---|---|---|
| Data integration tests | `packages/data/test/integration/migrations.spec.ts` still asserts migration count `'13'` while live migrations are `15`. | Inspector | Replace the hard-coded count with a count derived from platform migration files, or update it with an invariant explaining why the number is fixed. |
| Angular tests | `packages-web/angular-flow/test/` does not exist and `passWithNoTests` masks it. | Inspector | Execute `PORM-FLOW-08`: add service, route, component, permission, and export tests; remove or stop relying on `passWithNoTests`. |
| Final audit | `PORM-FLOW-09` has not run and cannot honestly close while the prior blockers remain. | Auditor | Run final closure only after the data test and Angular tests are real and green. |

## High Gaps

| Area | Gap | Why it matters | Proposed action |
|---|---|---|---|
| Angular API surface | `FlowApiService` lacks many backend/PORM-equivalent methods: scope detail/update/delete, graph/node/edge deletes, question CRUD, answer patch/delete/get, bulk fill-answer PUT, waiver update/delete, agent rule create/update/delete, transition effect create/update/delete, node form rule create/update/delete, task accept/decline/unaccept/withdraw/unassign/candidates/role users/user lookup, run events/facts/node-run/event/policy APIs. | Hosts cannot build the full PORM Flow workflows from the package facade. | Engineer follow-up to expand the facade to every route in `docs/contracts/flow-api.md`; Inspector tests should lock endpoints. |
| Angular UI parity | Current components are lightweight shells. PORM had rich graph/form/fill/waiver/task dialogs, nested editors, task cards, and route-bound pages. | Package builds, but user workflows are not yet feature-complete. | Engineer follow-up for route-param binding, graph editor actions, form/fill editors, waiver/task dialogs, and permission-aware controls. |
| Runtime effects | `FlowDomainAdapter.applyEffect` exists, but completed nodes only append `effect_requested`; no service consumes and applies effects. | Workflows cannot perform host-domain side effects except by out-of-band polling. | Add an explicit effect dispatcher/service or document `effect_requested` as the only contract and create runbook/tests for host consumption. |
| Resolver functions | DB `resolver_fn` agent rules currently return `agent_type = 'resolver'` and `agent_id = resolver_key`; adapter `resolveAgents` is not invoked by the runtime. | Dynamic task assignment from host logic is not actually resolved into actionable users/permissions. | Add app-side resolver expansion before task creation or provide an explicit deferred contract with tests proving the emitted resolver task shape. |
| Node form rules | `flow.node_form_rules` are stored and form facts are built, but runtime completion is governed by node `exit_rule`; form rules are not enforced directly in `node_try_complete`. | PORM semantics imply node form gates matter; STYNX currently relies on users encoding equivalent exit rules. | Architect decision: either make node form rules metadata-only and document it, or Engineer implementation to enforce gating modes in runtime. |
| PORM-compatible fill/answer aliases | PORM has `POST /flow/fills`, `PUT /flow/fills/:fillId/answers`, and form-scoped fill detail/answers/waivers aliases. STYNX exposes `POST /flow/forms/:formId/fills` and per-answer POST, but not all aliases/bulk flows. | Existing PORM frontend and tests depend on these shapes. | Decide whether STYNX intentionally breaks contract. If not, add aliases and tests. |
| Analytics paging/filtering | PORM analytics tests cover filters/paging such as scope/page/pageSize; STYNX `openTasks` and `runsSummary` are unpaged aggregate endpoints. | Large tenant data sets need bounded analytics responses. | Add query filters and pagination metadata, or mark endpoints as aggregate-only and add separate paged views. |

## Medium Gaps

| Area | Gap | Proposed action |
|---|---|---|
| HTTP/API e2e | Tests cover route metadata and DB functions, not full Nest HTTP with guards, interceptors, idempotency headers, audit writes, and request context. | Add package or reference-api e2e tests for representative design, runtime, task, form, and signal routes. |
| Task privilege semantics | Route permissions exist, and DB checks current-assignee for accept/decline/unaccept. Manager/assignee relation checks for act/withdraw/unassign and candidate-sensitive actions are not fully proven. | Port PORM task privilege tests into STYNX semantics and implement service-level `canManage`/`canView` adapter checks where required. |
| Policy semantics | Policy set/rule CRUD exists, and DB has `flow.eval_rule`; no tests prove policy allow/deny evaluation as a product feature. | Add policy evaluation service/tests or remove policy from closure criteria until specified. |
| OpenAPI/reference integration | No evidence that reference API imports `@stynx/flow` or that generated API docs include Flow routes. | Add reference app wiring and OpenAPI snapshot/check once backend route set is stable. |
| Release readiness | No changeset/release-readiness update proving both new packages are publishable. | Add package readiness notes after blockers/high gaps are closed. |
| Trace accuracy | `docs/architecture/trace.json` references an Angular Flow domain-neutrality test that does not exist. | Update trace after real Angular tests are written. |

## Deferred Or Intentional Non-Parity Candidates

These can be acceptable only if explicitly documented as STYNX contract decisions.

- Cytoscape graph canvas parity: PORM used a richer Cytoscape editor. STYNX may keep a dependency-light canvas if package tests document fallback and host extension points.
- PORM route aliases: STYNX can prefer cleaner route shapes, but then contract docs and migration notes must state which PORM routes are intentionally not preserved.
- Effect dispatch: appending `effect_requested` can be a valid event-sourcing boundary, but then it must be the documented integration protocol rather than an accidental missing worker.
- Node form gating: metadata-only node form rules can be valid, but the contract must say hosts/runtime must encode gating through node `exit_rule`.

## Ordered Completion Plan

1. Inspector: fix the stale platform migration count test and rerun `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int`.
2. Inspector: execute `PORM-FLOW-08` and create real `packages-web/angular-flow/test/**` coverage for exports, routes, service endpoints, component rendering, task actions, and permission-aware controls.
3. Engineer: expand `@stynx-web/angular-flow` API facade and UI shells to cover the backend contract and the PORM-derived user workflows that STYNX wants to keep.
4. Architect/Engineer: decide and then implement or document the runtime semantics for effect dispatch, resolver functions, and node form rule gating.
5. Engineer/Inspector: close backend API parity gaps: fill aliases/bulk answers, analytics paging/filtering, policy evaluation semantics, task privilege enforcement, and Nest HTTP e2e coverage.
6. Engineer: wire `@stynx/flow` into a reference API/app surface once route semantics stabilize.
7. Auditor: rerun `PORM-FLOW-09` and produce `docs/work/diag/porm-flow-closure.md` only when the above gates are green.

## CMS Guard

No CMS files are part of this reassessment. Static coupling grep returned no forbidden CMS/PORM domain references in `packages/flow`, `packages-web/angular-flow`, the Flow schema binding, or the Flow migration. The dirty file list reviewed during this run did not include CMS package paths.
